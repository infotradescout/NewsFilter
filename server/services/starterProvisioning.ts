import { and, eq, inArray } from "drizzle-orm";
import { FREE_FINANCE_FEED_PRESETS, STARTER_TOPIC_PRESETS } from "../../shared/starterPack";
import { db } from "../db";
import { feeds, topicFeeds, topics, userWatchTopics, users, watchTopics } from "../../shared/schema";
import { runTopicSync } from "./news/syncTopic";
import { newId } from "../utils/id";

function normalizeFeedInput(url: string, type: "custom_rss" | "google_query"): string {
  if (type === "google_query") return url.trim();
  return new URL(url.trim()).toString().replace(/\/$/, "");
}

const DEFAULT_WATCH_PRESETS = [
  {
    key: "watch-energy-shocks",
    name: "Energy Supply Shock",
    category: "commodities" as const,
    queryText: "opec production cut refinery outage sanctions oil supply disruption",
    window: "24h" as const,
  },
  {
    key: "watch-rate-policy",
    name: "Rate Policy Shift",
    category: "macro" as const,
    queryText: "federal reserve rates inflation cpi pce payrolls guidance",
    window: "24h" as const,
  },
  {
    key: "watch-crypto-liquidity",
    name: "Crypto Liquidity Risk",
    category: "crypto" as const,
    queryText: "bitcoin ethereum exchange outage liquidation inflow outflow regulation",
    window: "24h" as const,
  },
];

function toIncludeTerms(queryText: string): string[] {
  return queryText
    .split(/[,\n]/)
    .flatMap((segment) => segment.split(/\s+/))
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length >= 3)
    .slice(0, 20);
}

export async function ensureStarterCatalog(): Promise<void> {
  const adminUser = await db.query.users.findFirst({ where: eq(users.role, "admin") });
  const createdBy = adminUser?.id ?? null;
  const backfillTopicIds: string[] = [];

  await db
    .update(feeds)
    .set({
      active: true,
      updatedAt: new Date(),
    })
    .where(eq(feeds.active, false));

  for (const preset of FREE_FINANCE_FEED_PRESETS) {
    const normalizedUrl = normalizeFeedInput(preset.url, preset.type);
    const existing = await db.query.feeds.findFirst({ where: eq(feeds.url, normalizedUrl) });
    if (existing) continue;

    await db.insert(feeds).values({
      id: newId(),
      name: preset.name,
      url: normalizedUrl,
      type: preset.type,
      active: true,
      createdByUserId: createdBy,
    });
  }

  const activeFeedRows = await db.query.feeds.findMany({ where: eq(feeds.active, true) });
  const activeFeedIds = activeFeedRows.map((feed) => feed.id);

  for (const preset of STARTER_TOPIC_PRESETS) {
    const existing = await db.query.topics.findFirst({
      where: and(eq(topics.name, preset.name), eq(topics.scope, "shared")),
    });

    const topicId = existing?.id ?? newId();
    if (!existing) {
      await db.insert(topics).values({
        id: topicId,
        name: preset.name,
        description: preset.description,
        queryText: preset.queryText,
        category: preset.category,
        scope: "shared",
        ownerUserId: createdBy,
        window: preset.window,
        includeTerms: preset.includeTerms,
        excludeTerms: preset.excludeTerms,
        exactPhrases: preset.exactPhrases,
        isPersistent: false,
        active: true,
      });
      backfillTopicIds.push(topicId);
    }

    const existingLinks = await db.query.topicFeeds.findMany({ where: eq(topicFeeds.topicId, topicId) });
    const linkedFeedIdSet = new Set(existingLinks.map((link) => link.feedId));
    const missingFeedIds = activeFeedIds.filter((feedId) => !linkedFeedIdSet.has(feedId));

    if (missingFeedIds.length > 0) {
      await db.insert(topicFeeds).values(
        missingFeedIds.map((feedId) => ({
          topicId,
          feedId,
        }))
      );
    }
  }

  for (const preset of DEFAULT_WATCH_PRESETS) {
    let linkedTopic = await db.query.topics.findFirst({
      where: and(eq(topics.name, `[WATCH] ${preset.name}`), eq(topics.scope, "shared")),
    });

    if (!linkedTopic) {
      const linkedTopicId = newId();
      await db.insert(topics).values({
        id: linkedTopicId,
        name: `[WATCH] ${preset.name}`,
        description: "Persistent watch topic",
        queryText: preset.queryText,
        category: preset.category,
        scope: "shared",
        ownerUserId: createdBy,
        window: preset.window,
        includeTerms: toIncludeTerms(preset.queryText),
        excludeTerms: [],
        exactPhrases: [],
        isPersistent: true,
        active: true,
      });
      linkedTopic = await db.query.topics.findFirst({ where: eq(topics.id, linkedTopicId) });
      backfillTopicIds.push(linkedTopicId);
    }

    const existingWatch = await db.query.watchTopics.findFirst({ where: eq(watchTopics.name, preset.name) });
    if (!existingWatch) {
      await db.insert(watchTopics).values({
        id: newId(),
        name: preset.name,
        category: preset.category,
        queryText: preset.queryText,
        linkedTopicId: linkedTopic?.id ?? null,
        isActive: true,
        createdByUserId: createdBy,
      });
    }
  }

  for (const topicId of backfillTopicIds) {
    void runTopicSync(topicId, "backfill").catch((error) => {
      console.error("[starter] automatic backfill failed", error);
    });
  }
}

export async function ensureUserDefaults(userId: string): Promise<void> {
  const watchRows = await db.query.watchTopics.findMany({ where: eq(watchTopics.isActive, true) });
  if (watchRows.length === 0) return;

  const watchIds = watchRows.map((item) => item.id);
  const existingRows = await db.query.userWatchTopics.findMany({
    where: and(eq(userWatchTopics.userId, userId), inArray(userWatchTopics.watchTopicId, watchIds)),
  });
  const existingSet = new Set(existingRows.map((row) => row.watchTopicId));

  const missingRows = watchRows.filter((item) => !existingSet.has(item.id));
  if (missingRows.length === 0) return;

  await db.insert(userWatchTopics).values(
    missingRows.map((item) => ({
      userId,
      watchTopicId: item.id,
      isFollowing: true,
    }))
  );
}
