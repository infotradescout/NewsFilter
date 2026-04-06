import type { Express } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { feeds } from "../../shared/schema";
import { FREE_FINANCE_FEED_PRESETS } from "../../shared/starterPack";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { newId } from "../utils/id";

const createFeedSchema = z.object({
  name: z.string().min(2).max(120),
  url: z.string().min(3).max(500),
  type: z.enum(["custom_rss", "google_query"]).default("custom_rss"),
});

const updateFeedSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  url: z.string().min(3).max(500).optional(),
  type: z.enum(["custom_rss", "google_query"]).optional(),
});

function normalizeFeedUrl(raw: string, type: "custom_rss" | "google_query"): string {
  if (type === "google_query") {
    return raw.trim();
  }
  const parsed = new URL(raw.trim());
  return parsed.toString().replace(/\/$/, "");
}

export function registerFeedRoutes(app: Express): void {
  app.get("/api/feeds/presets", requireAuth, (_req, res) => {
    res.json({ presets: FREE_FINANCE_FEED_PRESETS });
  });

  app.get("/api/feeds", requireAuth, async (_req, res) => {
    const rows = await db.query.feeds.findMany({
      orderBy: [desc(feeds.createdAt)],
    });

    res.json({ feeds: rows });
  });

  app.post("/api/feeds", requireAuth, async (req, res) => {
    const parsed = createFeedSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid feed payload" });
      return;
    }

    if (parsed.data.type === "custom_rss") {
      try {
        new URL(parsed.data.url);
      } catch {
        res.status(400).json({ error: "Custom RSS feeds need a valid URL" });
        return;
      }
    }

    const normalizedUrl = normalizeFeedUrl(parsed.data.url, parsed.data.type);
    const existing = await db.query.feeds.findFirst({ where: eq(feeds.url, normalizedUrl) });
    if (existing) {
      res.status(200).json({ feed: existing, existing: true });
      return;
    }

    const [created] = await db
      .insert(feeds)
      .values({
        id: newId(),
        name: parsed.data.name,
        url: normalizedUrl,
        type: parsed.data.type,
        createdByUserId: req.session.user!.id,
      })
      .returning();

    res.status(201).json({ feed: created, existing: false });
  });

  app.patch("/api/feeds/:id", requireAuth, async (req, res) => {
    const feedId = String(req.params.id);
    const parsed = updateFeedSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid feed update payload" });
      return;
    }
    const existing = await db.query.feeds.findFirst({ where: eq(feeds.id, feedId) });
    if (!existing) {
      res.status(404).json({ error: "Feed not found" });
      return;
    }

    const nextType = parsed.data.type ?? existing.type;
    if (parsed.data.url && nextType === "custom_rss") {
      try {
        new URL(parsed.data.url);
      } catch {
        res.status(400).json({ error: "Custom RSS feeds need a valid URL" });
        return;
      }
    }

    const [updated] = await db
      .update(feeds)
      .set({
        ...parsed.data,
        url: parsed.data.url ? normalizeFeedUrl(parsed.data.url, nextType) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(feeds.id, feedId))
      .returning();

    res.json({ feed: updated });
  });

  app.delete("/api/feeds/:id", requireAuth, async (req, res) => {
    const feedId = String(req.params.id);
    const [deleted] = await db.delete(feeds).where(eq(feeds.id, feedId)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Feed not found" });
      return;
    }

    res.json({ ok: true });
  });
}
