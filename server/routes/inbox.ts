import type { Express } from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { articles, inboxReads, summaries, topics, userWatchTopics, watchTopics } from "../../shared/schema";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { runTopicSync } from "../services/news/syncTopic";

const inboxQuerySchema = z.object({
  topicId: z.string().optional(),
  window: z.enum(["24h", "7d", "30d"]).optional(),
  category: z.enum(["macro", "commodities", "equities", "crypto"]).optional(),
  unread: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

export function registerInboxRoutes(app: Express): void {
  async function getAccessibleTopics(user: { id: string; role: "admin" | "member" }) {
    return user.role === "admin"
      ? db.query.topics.findMany()
      : db.query.topics.findMany({
          where: or(eq(topics.scope, "shared"), and(eq(topics.scope, "personal"), eq(topics.ownerUserId, user.id))),
        });
  }

  app.get("/api/inbox", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const parsedQuery = inboxQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({ error: "Invalid inbox query" });
      return;
    }

    const accessTopics = await getAccessibleTopics(user);

    const accessTopicIds = accessTopics.map((topic) => topic.id);

    if (accessTopicIds.length === 0) {
      res.json({ items: [] });
      return;
    }

    const watchRows = await db.query.watchTopics.findMany();
    const unfollowedRows = await db.query.userWatchTopics.findMany({
      where: and(eq(userWatchTopics.userId, user.id), eq(userWatchTopics.isFollowing, false)),
    });
    const unfollowedWatchIds = new Set(unfollowedRows.map((row) => row.watchTopicId));
    const excludedLinkedTopicIds = new Set(
      watchRows
        .filter((watchTopic) => unfollowedWatchIds.has(watchTopic.id) && watchTopic.linkedTopicId)
        .map((watchTopic) => watchTopic.linkedTopicId as string)
    );

    const rows = await db
      .select({
        summaryId: summaries.id,
        topicId: topics.id,
        topicName: topics.name,
        category: topics.category,
        window: summaries.window,
        headline: summaries.headline,
        bullets: summaries.bullets,
        sourceLink: summaries.sourceLink,
        sourceDomain: articles.sourceDomain,
        publishedAt: summaries.publishedAt,
        createdAt: summaries.createdAt,
      })
      .from(summaries)
      .innerJoin(topics, eq(topics.id, summaries.topicId))
      .innerJoin(articles, eq(articles.id, summaries.articleId))
      .where(inArray(summaries.topicId, accessTopicIds))
      .orderBy(desc(summaries.createdAt))
      .limit(300);

    const filtered = rows.filter((row) => !excludedLinkedTopicIds.has(row.topicId));
    const summaryIds = filtered.map((row) => row.summaryId);

    const readRows = summaryIds.length
      ? await db
          .select({ summaryId: inboxReads.summaryId })
          .from(inboxReads)
          .where(and(eq(inboxReads.userId, user.id), inArray(inboxReads.summaryId, summaryIds)))
      : [];
    const readSet = new Set(readRows.map((row) => row.summaryId));

    let items = filtered.map((row) => ({
      id: row.summaryId,
      topicId: row.topicId,
      topicName: row.topicName,
      category: row.category,
      window: row.window,
      headline: row.headline,
      bullets: row.bullets,
      sourceLink: row.sourceLink,
      sourceDomain: row.sourceDomain,
      publishedAt: row.publishedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      read: readSet.has(row.summaryId),
    }));

    if (parsedQuery.data.topicId) {
      items = items.filter((item) => item.topicId === parsedQuery.data.topicId);
    }
    if (parsedQuery.data.window) {
      items = items.filter((item) => item.window === parsedQuery.data.window);
    }
    if (parsedQuery.data.category) {
      items = items.filter((item) => item.category === parsedQuery.data.category);
    }
    if (parsedQuery.data.unread) {
      items = items.filter((item) => !item.read);
    }

    items = [...items].sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()
    );

    // One live card per topic: newest update replaces older cards.
    const latestByTopic: typeof items = [];
    const seenTopicIds = new Set<string>();
    for (const item of items) {
      if (seenTopicIds.has(item.topicId)) continue;
      seenTopicIds.add(item.topicId);
      latestByTopic.push(item);
    }

    items = latestByTopic;

    res.json({ items });
  });

  app.post("/api/inbox/refresh", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const accessTopics = await getAccessibleTopics(user);
    const runnableTopicIds = accessTopics.filter((topic) => topic.active).map((topic) => topic.id);

    for (const topicId of runnableTopicIds) {
      void runTopicSync(topicId, "manual").catch((error) => {
        console.error("[inbox] manual refresh failed", error);
      });
    }

    res.status(202).json({ ok: true, queuedTopics: runnableTopicIds.length });
  });

  app.post("/api/inbox/:itemId/read", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const summaryId = String(req.params.itemId);

    await db
      .insert(inboxReads)
      .values({
        userId: user.id,
        summaryId,
      })
      .onConflictDoUpdate({
        target: [inboxReads.userId, inboxReads.summaryId],
        set: {
          readAt: new Date(),
        },
      });

    res.json({ ok: true });
  });
}
