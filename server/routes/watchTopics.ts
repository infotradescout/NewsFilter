import type { Express } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { topics, userWatchTopics, watchTopics } from "../../shared/schema";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { runWatchTopicBackfill } from "../services/news/syncTopic";
import { newId } from "../utils/id";

const createWatchTopicSchema = z.object({
  name: z.string().min(2).max(140),
  category: z.enum(["macro", "commodities", "equities", "crypto"]),
  queryText: z.string().min(3).max(240),
  isActive: z.boolean().default(true),
  window: z.enum(["24h", "7d", "30d"]).default("24h"),
});

const updateWatchTopicSchema = z.object({
  name: z.string().min(2).max(140).optional(),
  category: z.enum(["macro", "commodities", "equities", "crypto"]).optional(),
  queryText: z.string().min(3).max(240).optional(),
  isActive: z.boolean().optional(),
  window: z.enum(["24h", "7d", "30d"]).optional(),
  followed: z.boolean().optional(),
});

function toIncludeTerms(queryText: string): string[] {
  return queryText
    .split(/[,\n]/)
    .flatMap((segment) => segment.split(/\s+/))
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length >= 3)
    .slice(0, 20);
}

function isAdmin(user: { role: "admin" | "member" }): boolean {
  return user.role === "admin";
}

export function registerWatchTopicRoutes(app: Express): void {
  app.get("/api/watch-topics", requireAuth, async (req, res) => {
    const items = await db.query.watchTopics.findMany({
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    const followRows = await db.query.userWatchTopics.findMany({
      where: eq(userWatchTopics.userId, req.session.user!.id),
    });
    const followMap = new Map(followRows.map((row) => [row.watchTopicId, row.isFollowing]));

    res.json({
      watchTopics: items.map((item) => ({
        ...item,
        followed: followMap.get(item.id) ?? true,
      })),
    });
  });

  app.post("/api/watch-topics", requireAuth, async (req, res) => {
    const parsed = createWatchTopicSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid watch topic payload" });
      return;
    }

    if (!isAdmin(req.session.user!)) {
      res.status(403).json({ error: "Only admins can create watch topics" });
      return;
    }

    const linkedTopicId = newId();
    await db.insert(topics).values({
      id: linkedTopicId,
      name: `[WATCH] ${parsed.data.name}`,
      description: "Persistent watch topic",
      queryText: parsed.data.queryText,
      category: parsed.data.category,
      scope: "shared",
      ownerUserId: req.session.user!.id,
      window: parsed.data.window,
      includeTerms: toIncludeTerms(parsed.data.queryText),
      excludeTerms: [],
      exactPhrases: [],
      isPersistent: true,
      active: parsed.data.isActive,
    });

    const watchTopicId = newId();
    const [created] = await db
      .insert(watchTopics)
      .values({
        id: watchTopicId,
        name: parsed.data.name,
        category: parsed.data.category,
        queryText: parsed.data.queryText,
        linkedTopicId,
        isActive: parsed.data.isActive,
        createdByUserId: req.session.user!.id,
      })
      .returning();

    void runWatchTopicBackfill(watchTopicId).catch((error) => {
      console.error("[watch-topics] backfill failed", error);
    });

    res.status(201).json({ watchTopic: { ...created, followed: true } });
  });

  app.patch("/api/watch-topics/:id", requireAuth, async (req, res) => {
    const watchTopicId = String(req.params.id);
    const parsed = updateWatchTopicSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid watch topic update payload" });
      return;
    }

    const watch = await db.query.watchTopics.findFirst({ where: eq(watchTopics.id, watchTopicId) });
    if (!watch) {
      res.status(404).json({ error: "Watch topic not found" });
      return;
    }

    const user = req.session.user!;

    const adminFieldsChanged =
      parsed.data.name !== undefined ||
      parsed.data.category !== undefined ||
      parsed.data.queryText !== undefined ||
      parsed.data.isActive !== undefined ||
      parsed.data.window !== undefined;

    if (parsed.data.followed !== undefined && !adminFieldsChanged) {
      await db
        .insert(userWatchTopics)
        .values({
          userId: user.id,
          watchTopicId: watch.id,
          isFollowing: parsed.data.followed,
        })
        .onConflictDoUpdate({
          target: [userWatchTopics.userId, userWatchTopics.watchTopicId],
          set: {
            isFollowing: parsed.data.followed,
            updatedAt: new Date(),
          },
        });

      res.json({ ok: true, followed: parsed.data.followed });
      return;
    }

    if (!isAdmin(user)) {
      res.status(403).json({ error: "Only admins can edit watch topic settings" });
      return;
    }

    const [updated] = await db
      .update(watchTopics)
      .set({
        name: parsed.data.name ?? watch.name,
        category: parsed.data.category ?? watch.category,
        queryText: parsed.data.queryText ?? watch.queryText,
        isActive: parsed.data.isActive ?? watch.isActive,
        updatedAt: new Date(),
      })
      .where(eq(watchTopics.id, watch.id))
      .returning();

    if (watch.linkedTopicId) {
      await db
        .update(topics)
        .set({
          name: parsed.data.name ? `[WATCH] ${parsed.data.name}` : `[WATCH] ${watch.name}`,
          category: parsed.data.category ?? watch.category,
          queryText: parsed.data.queryText ?? watch.queryText,
          includeTerms: toIncludeTerms(parsed.data.queryText ?? watch.queryText),
          window: parsed.data.window ?? "24h",
          active: parsed.data.isActive ?? watch.isActive,
          updatedAt: new Date(),
        })
        .where(eq(topics.id, watch.linkedTopicId));
    }

    res.json({ watchTopic: { ...updated, followed: true } });
  });

  app.delete("/api/watch-topics/:id", requireAuth, async (req, res) => {
    const watchTopicId = String(req.params.id);
    if (!isAdmin(req.session.user!)) {
      res.status(403).json({ error: "Only admins can delete watch topics" });
      return;
    }

    const watch = await db.query.watchTopics.findFirst({ where: eq(watchTopics.id, watchTopicId) });
    if (!watch) {
      res.status(404).json({ error: "Watch topic not found" });
      return;
    }

    await db.delete(watchTopics).where(eq(watchTopics.id, watch.id));
    if (watch.linkedTopicId) {
      await db.delete(topics).where(eq(topics.id, watch.linkedTopicId));
    }

    res.json({ ok: true });
  });
}
