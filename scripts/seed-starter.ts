import "dotenv/config";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { db, pool } from "../server/db";
import { feeds, topics, topicFeeds, userWatchTopics, users, watchTopics } from "../shared/schema";
import { FREE_FINANCE_FEED_PRESETS, STARTER_TOPIC_PRESETS } from "../shared/starterPack";
import { newId } from "../server/utils/id";
import { runTopicSync } from "../server/services/news/syncTopic";

type SeedFeed = { name: string; url: string };
type SeedTopic = {
  name: string;
  category: "macro" | "commodities" | "equities" | "crypto";
  scope: "shared" | "personal";
  window: "24h" | "7d" | "30d";
  queryText: string;
  includeTerms: string[];
  excludeTerms: string[];
  exactPhrases: string[];
};

type SeedWatch = {
  name: string;
  category: "macro" | "commodities" | "equities" | "crypto";
  queryText: string;
};

const starterFeeds: SeedFeed[] = FREE_FINANCE_FEED_PRESETS.map((feed) => ({
  name: feed.name,
  url: feed.url,
}));

const starterTopics: SeedTopic[] = STARTER_TOPIC_PRESETS.map((topic) => ({
  name: topic.name,
  category: topic.category,
  scope: "shared",
  window: topic.window,
  queryText: topic.queryText,
  includeTerms: topic.includeTerms,
  excludeTerms: topic.excludeTerms,
  exactPhrases: topic.exactPhrases,
}));

const starterWatchTopics: SeedWatch[] = [
  { name: "Always On: Fed & CPI", category: "macro", queryText: "fed fomc cpi pce payroll inflation" },
  { name: "Always On: Energy Shock", category: "commodities", queryText: "opec brent wti lng refinery disruption" },
  { name: "Always On: Crypto Liquidity", category: "crypto", queryText: "bitcoin etf flow liquidation exchange liquidity" },
];

async function upsertFeeds(adminId: string) {
  const feedMap = new Map<string, string>();

  for (const feed of starterFeeds) {
    const existing = await db.query.feeds.findFirst({ where: eq(feeds.url, feed.url) });
    if (existing) {
      feedMap.set(feed.name, existing.id);
      continue;
    }

    const [created] = await db
      .insert(feeds)
      .values({
        id: newId(),
        name: feed.name,
        url: feed.url,
        type: "custom_rss",
        active: true,
        createdByUserId: adminId,
      })
      .returning();

    feedMap.set(feed.name, created.id);
  }

  return feedMap;
}

async function upsertTopics(adminId: string, feedMap: Map<string, string>) {
  const topicIds: string[] = [];
  const allFeedIds = [...feedMap.values()];

  for (const topic of starterTopics) {
    let topicRow = await db.query.topics.findFirst({ where: eq(topics.name, topic.name) });

    if (!topicRow) {
      const [created] = await db
        .insert(topics)
        .values({
          id: newId(),
          name: topic.name,
          description: "Seeded starter topic",
          queryText: topic.queryText,
          category: topic.category,
          scope: topic.scope,
          ownerUserId: adminId,
          window: topic.window,
          includeTerms: topic.includeTerms,
          excludeTerms: topic.excludeTerms,
          exactPhrases: topic.exactPhrases,
          isPersistent: false,
          active: true,
        })
        .returning();

      topicRow = created;
    }

    topicIds.push(topicRow.id);

    for (const feedId of allFeedIds) {
      await db
        .insert(topicFeeds)
        .values({ topicId: topicRow.id, feedId })
        .onConflictDoNothing();
    }
  }

  return topicIds;
}

async function upsertWatchTopics(adminId: string) {
  for (const watch of starterWatchTopics) {
    let linkedTopic = await db.query.topics.findFirst({ where: eq(topics.name, `[WATCH] ${watch.name}`) });

    if (!linkedTopic) {
      const [createdTopic] = await db
        .insert(topics)
        .values({
          id: newId(),
          name: `[WATCH] ${watch.name}`,
          description: "Seeded persistent watch topic",
          queryText: watch.queryText,
          category: watch.category,
          scope: "shared",
          ownerUserId: adminId,
          window: "24h",
          includeTerms: watch.queryText.split(/\s+/).filter((w) => w.length > 2),
          excludeTerms: [],
          exactPhrases: [],
          isPersistent: true,
          active: true,
        })
        .returning();

      linkedTopic = createdTopic;
    }

    let watchRow = await db.query.watchTopics.findFirst({ where: eq(watchTopics.name, watch.name) });
    if (!watchRow) {
      const [createdWatch] = await db
        .insert(watchTopics)
        .values({
          id: newId(),
          name: watch.name,
          category: watch.category,
          queryText: watch.queryText,
          linkedTopicId: linkedTopic.id,
          isActive: true,
          createdByUserId: adminId,
        })
        .returning();

      watchRow = createdWatch;
    }

    await db
      .insert(userWatchTopics)
      .values({ userId: adminId, watchTopicId: watchRow.id, isFollowing: true })
      .onConflictDoNothing();
  }
}

async function runInitialBackfill(topicIds: string[]) {
  for (const topicId of topicIds) {
    try {
      await runTopicSync(topicId, "manual");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[seed] backfill failed for topic ${topicId}: ${message}`);
    }
  }
}

async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "";
  if (!adminEmail) {
    throw new Error("SEED_ADMIN_EMAIL must be set in .env before seeding starter data.");
  }

  let admin = await db.query.users.findFirst({ where: eq(users.email, adminEmail) });
  if (!admin) {
    if (!adminPassword) {
      throw new Error("SEED_ADMIN_PASSWORD must be set to create the admin user.");
    }
    const [createdAdmin] = await db
      .insert(users)
      .values({
        id: newId(),
        email: adminEmail,
        passwordHash: await hash(adminPassword, 12),
        role: "admin",
      })
      .returning();
    admin = createdAdmin;
  }

  const feedMap = await upsertFeeds(admin.id);
  const topicIds = await upsertTopics(admin.id, feedMap);
  await upsertWatchTopics(admin.id);
  await runInitialBackfill(topicIds);

  console.log("Starter finance feeds/topics/watch topics seeded.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
