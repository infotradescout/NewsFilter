import type { Express } from "express";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { topicFeeds, topics } from "../../shared/schema";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { runTopicSync } from "../services/news/syncTopic";
import { newId } from "../utils/id";

const rulesSchema = z.object({
  includeTerms: z.array(z.string()).default([]),
  excludeTerms: z.array(z.string()).default([]),
  exactPhrases: z.array(z.string()).default([]),
});

const createTopicSchema = z.object({
  name: z.string().min(2).max(140),
  description: z.string().max(500).optional().nullable(),
  queryText: z.string().max(240).optional().nullable(),
  category: z.enum(["macro", "commodities", "equities", "crypto"]),
  scope: z.enum(["personal", "shared"]).default("personal"),
  window: z.enum(["24h", "7d", "30d"]).default("24h"),
  rules: rulesSchema,
  isPersistent: z.boolean().default(false),
  feedIds: z.array(z.string()).default([]),
});

const updateTopicSchema = z.object({
  name: z.string().min(2).max(140).optional(),
  description: z.string().max(500).optional().nullable(),
  queryText: z.string().max(240).optional().nullable(),
  category: z.enum(["macro", "commodities", "equities", "crypto"]).optional(),
  window: z.enum(["24h", "7d", "30d"]).optional(),
  rules: rulesSchema.optional(),
  feedIds: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

function canEditTopic(user: { id: string; role: "admin" | "member" }, topic: { ownerUserId: string | null; scope: "personal" | "shared" }) {
  if (user.role === "admin") {
    return true;
  }
  return topic.scope === "personal" && topic.ownerUserId === user.id;
}

async function hydrateFeedIds(topicIds: string[]): Promise<Map<string, string[]>> {
  if (topicIds.length === 0) {
    return new Map();
  }

  const links = await db
    .select({ topicId: topicFeeds.topicId, feedId: topicFeeds.feedId })
    .from(topicFeeds)
    .where(inArray(topicFeeds.topicId, topicIds));

  const map = new Map<string, string[]>();
  for (const link of links) {
    const list = map.get(link.topicId) ?? [];
    list.push(link.feedId);
    map.set(link.topicId, list);
  }

  return map;
}

export function registerTopicRoutes(app: Express): void {
  app.get("/api/topics", requireAuth, async (req, res) => {
    const user = req.session.user!;

    const topicRows =
      user.role === "admin"
        ? await db.query.topics.findMany({ orderBy: (table, { desc }) => [desc(table.createdAt)] })
        : await db.query.topics.findMany({
            where: or(eq(topics.scope, "shared"), and(eq(topics.scope, "personal"), eq(topics.ownerUserId, user.id))),
            orderBy: (table, { desc }) => [desc(table.createdAt)],
          });

    const feedMap = await hydrateFeedIds(topicRows.map((topic) => topic.id));

    res.json({
      topics: topicRows.map((topic) => ({
        ...topic,
        feedIds: feedMap.get(topic.id) ?? [],
      })),
    });
  });

  app.post("/api/topics", requireAuth, async (req, res) => {
    const parsed = createTopicSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid topic payload" });
      return;
    }

    const user = req.session.user!;
    if (user.role !== "admin" && parsed.data.scope === "shared") {
      res.status(403).json({ error: "Members can only create personal topics" });
      return;
    }

    const topicId = newId();
    const [created] = await db
      .insert(topics)
      .values({
        id: topicId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        queryText: parsed.data.queryText ?? null,
        category: parsed.data.category,
        scope: parsed.data.scope,
        ownerUserId: user.id,
        window: parsed.data.window,
        includeTerms: parsed.data.rules.includeTerms,
        excludeTerms: parsed.data.rules.excludeTerms,
        exactPhrases: parsed.data.rules.exactPhrases,
        isPersistent: parsed.data.isPersistent,
      })
      .returning();

    if (parsed.data.feedIds.length > 0) {
      await db.insert(topicFeeds).values(
        parsed.data.feedIds.map((feedId) => ({
          topicId,
          feedId,
        }))
      );
    }

    void runTopicSync(topicId, "backfill").catch((error) => {
      console.error("[topics] immediate backfill failed", error);
    });

    res.status(201).json({
      topic: {
        ...created,
        feedIds: parsed.data.feedIds,
      },
    });
  });

  app.patch("/api/topics/:id", requireAuth, async (req, res) => {
    const topicId = String(req.params.id);
    const parsed = updateTopicSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid topic update payload" });
      return;
    }

    const topic = await db.query.topics.findFirst({ where: eq(topics.id, topicId) });
    if (!topic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    const user = req.session.user!;
    if (!canEditTopic(user, topic)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [updated] = await db
      .update(topics)
      .set({
        name: parsed.data.name ?? topic.name,
        description: parsed.data.description ?? topic.description,
        queryText: parsed.data.queryText ?? topic.queryText,
        category: parsed.data.category ?? topic.category,
        window: parsed.data.window ?? topic.window,
        includeTerms: parsed.data.rules?.includeTerms ?? topic.includeTerms,
        excludeTerms: parsed.data.rules?.excludeTerms ?? topic.excludeTerms,
        exactPhrases: parsed.data.rules?.exactPhrases ?? topic.exactPhrases,
        active: parsed.data.active ?? topic.active,
        updatedAt: new Date(),
      })
      .where(eq(topics.id, topic.id))
      .returning();

    let feedIds: string[] = [];

    if (parsed.data.feedIds) {
      await db.delete(topicFeeds).where(eq(topicFeeds.topicId, topic.id));
      if (parsed.data.feedIds.length > 0) {
        await db.insert(topicFeeds).values(
          parsed.data.feedIds.map((feedId) => ({
            topicId: topic.id,
            feedId,
          }))
        );
      }
      feedIds = parsed.data.feedIds;
    } else {
      const links = await db
        .select({ feedId: topicFeeds.feedId })
        .from(topicFeeds)
        .where(eq(topicFeeds.topicId, topic.id));
      feedIds = links.map((link) => link.feedId);
    }

    res.json({
      topic: {
        ...updated,
        feedIds,
      },
    });
  });

  app.delete("/api/topics/:id", requireAuth, async (req, res) => {
    const topicId = String(req.params.id);
    const topic = await db.query.topics.findFirst({ where: eq(topics.id, topicId) });
    if (!topic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    const user = req.session.user!;
    if (!canEditTopic(user, topic)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await db.delete(topics).where(eq(topics.id, topic.id));
    res.json({ ok: true });
  });

  app.post("/api/topics/:id/backfill", requireAuth, async (req, res) => {
    const topicId = String(req.params.id);
    const topic = await db.query.topics.findFirst({ where: eq(topics.id, topicId) });
    if (!topic) {
      res.status(404).json({ error: "Topic not found" });
      return;
    }

    const user = req.session.user!;
    if (!canEditTopic(user, topic)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    void runTopicSync(topic.id, "manual").catch((error) => {
      console.error("[topics] manual backfill failed", error);
    });

    res.status(202).json({ ok: true, status: "queued" });
  });
}
