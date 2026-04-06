import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "member"]);
export const topicScopeEnum = pgEnum("topic_scope", ["personal", "shared"]);
export const topicWindowEnum = pgEnum("topic_window", ["24h", "7d", "30d"]);
export const financeCategoryEnum = pgEnum("finance_category", [
  "macro",
  "commodities",
  "equities",
  "crypto",
]);
export const impactClassEnum = pgEnum("impact_class", [
  "central_banks",
  "inflation_jobs",
  "energy_shock",
  "metals_supply",
  "regulation",
  "exchange_liquidity",
  "general",
]);
export const feedTypeEnum = pgEnum("feed_type", ["custom_rss", "google_query"]);
export const articleSourceEnum = pgEnum("article_source", ["google_news", "custom_rss"]);
export const jobTriggerEnum = pgEnum("job_trigger", ["scheduler", "backfill", "manual"]);
export const jobStatusEnum = pgEnum("job_status", ["running", "success", "failed"]);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)]
);

export const invites = pgTable(
  "invites",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: roleEnum("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: text("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("invites_token_hash_idx").on(table.tokenHash)]
);

export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
});

export const feeds = pgTable(
  "feeds",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    type: feedTypeEnum("type").notNull().default("custom_rss"),
    active: boolean("active").notNull().default(true),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("feeds_url_idx").on(table.url)]
);

export const topics = pgTable("topics", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  queryText: text("query_text"),
  category: financeCategoryEnum("category").notNull(),
  scope: topicScopeEnum("scope").notNull().default("personal"),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  window: topicWindowEnum("window").notNull().default("24h"),
  includeTerms: jsonb("include_terms")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  excludeTerms: jsonb("exclude_terms")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  exactPhrases: jsonb("exact_phrases")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  isPersistent: boolean("is_persistent").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const topicFeeds = pgTable(
  "topic_feeds",
  {
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    feedId: text("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.topicId, table.feedId] })]
);

export const watchTopics = pgTable(
  "watch_topics",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    category: financeCategoryEnum("category").notNull(),
    queryText: text("query_text").notNull(),
    linkedTopicId: text("linked_topic_id").references(() => topics.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("watch_topics_linked_topic_idx").on(table.linkedTopicId)]
);

export const userWatchTopics = pgTable(
  "user_watch_topics",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    watchTopicId: text("watch_topic_id")
      .notNull()
      .references(() => watchTopics.id, { onDelete: "cascade" }),
    isFollowing: boolean("is_following").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.watchTopicId] })]
);

export const articles = pgTable(
  "articles",
  {
    id: text("id").primaryKey(),
    sourceType: articleSourceEnum("source_type").notNull(),
    sourceName: text("source_name").notNull(),
    sourceDomain: text("source_domain").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    summarySnippet: text("summary_snippet"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [uniqueIndex("articles_dedupe_key_idx").on(table.dedupeKey)]
);

export const topicMatches = pgTable(
  "topic_matches",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    window: topicWindowEnum("window").notNull(),
    impactClass: impactClassEnum("impact_class").notNull().default("general"),
    rank: integer("rank").notNull(),
    isVetted: boolean("is_vetted").notNull().default(true),
    vettingScore: doublePrecision("vetting_score").notNull(),
    vettingBreakdown: jsonb("vetting_breakdown")
      .$type<{
        marketImpact: number;
        keywordMatch: number;
        freshness: number;
        sourceTrust: number;
        reasons: string[];
      }>()
      .notNull(),
    matchedAt: timestamp("matched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) =>
    [uniqueIndex("topic_matches_topic_article_window_idx").on(table.topicId, table.articleId, table.window)]
);

export const summaries = pgTable(
  "summaries",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    window: topicWindowEnum("window").notNull(),
    headline: text("headline").notNull(),
    bullets: jsonb("bullets").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    sourceLink: text("source_link").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("summaries_topic_article_window_idx").on(table.topicId, table.articleId, table.window)]
);

export const inboxReads = pgTable(
  "inbox_reads",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    summaryId: text("summary_id")
      .notNull()
      .references(() => summaries.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.summaryId] })]
);

export const jobRuns = pgTable("job_runs", {
  id: text("id").primaryKey(),
  jobName: text("job_name").notNull(),
  trigger: jobTriggerEnum("trigger").notNull(),
  status: jobStatusEnum("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  fetchedCount: integer("fetched_count").notNull().default(0),
  dedupedCount: integer("deduped_count").notNull().default(0),
  vettedCount: integer("vetted_count").notNull().default(0),
  summarizedCount: integer("summarized_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  tokenUsage: integer("token_usage").notNull().default(0),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
});
