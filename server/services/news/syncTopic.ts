import { and, desc, eq, inArray } from "drizzle-orm";
import {
  articles,
  feeds,
  jobRuns,
  summaries,
  topicFeeds,
  topicMatches,
  topics,
  watchTopics,
} from "../../../shared/schema";
import { db } from "../../db";
import { newId } from "../../utils/id";
import { withAdvisoryLock } from "../advisoryLocks";
import { buildDedupeKey, canonicalizeUrl, sourceDomain } from "./dedupe";
import { buildGoogleNewsQuery } from "./googleRss";
import { normalizeRules, scoreKeywordMatch } from "./keywordRules";
import { classifyMarketImpact } from "./marketImpact";
import { fetchGoogleNewsArticles, fetchRssFeed } from "./rss";
import { computeWindowCutoff, freshnessScore, sourceTrustScore } from "./scoring";
import { summarizeArticle } from "./summarize";
import type { JobCounters, NormalizedArticleRecord, TopicSyncInput } from "./types";

const MIN_VETTING_SCORE = 0.65;
const MAX_VETTED = 15;
const MAX_SUMMARIES = 5;

export interface RankedCandidate {
  articleId: string;
  topicId: string;
  window: "24h" | "7d" | "30d";
  title: string;
  summarySnippet: string;
  sourceDomain: string;
  canonicalUrl: string;
  publishedAt: Date;
  score: number;
  impactClass:
    | "central_banks"
    | "inflation_jobs"
    | "energy_shock"
    | "metals_supply"
    | "regulation"
    | "exchange_liquidity"
    | "general";
  breakdown: {
    marketImpact: number;
    keywordMatch: number;
    freshness: number;
    sourceTrust: number;
    reasons: string[];
  };
}

export function computeVettingScore(args: {
  marketImpact: number;
  keywordMatch: number;
  freshness: number;
  sourceTrust: number;
}): number {
  const score =
    args.marketImpact * 0.45 + args.keywordMatch * 0.35 + args.freshness * 0.1 + args.sourceTrust * 0.1;
  return Number(score.toFixed(6));
}

export function rankVettedCandidates(candidates: RankedCandidate[]): RankedCandidate[] {
  return [...candidates].sort((left, right) => {
    if (right.score === left.score) {
      return right.publishedAt.getTime() - left.publishedAt.getTime();
    }
    return right.score - left.score;
  });
}

export function pickSummaryCandidates(candidates: RankedCandidate[]): RankedCandidate[] {
  return rankVettedCandidates(candidates).slice(0, MAX_SUMMARIES);
}

export function filterUncachedCandidates(
  candidates: RankedCandidate[],
  existingCacheKeys: Set<string>
): RankedCandidate[] {
  return candidates.filter(
    (candidate) => !existingCacheKeys.has(`${candidate.topicId}:${candidate.articleId}:${candidate.window}`)
  );
}

function normalizeArticle(input: {
  sourceType: "google_news" | "custom_rss";
  sourceName: string;
  title: string;
  url: string;
  publishedAt: Date;
  summarySnippet: string;
  rawPayload: Record<string, unknown>;
}): NormalizedArticleRecord {
  const canonicalUrl = canonicalizeUrl(input.url);
  const domain = sourceDomain(canonicalUrl);
  return {
    ...input,
    canonicalUrl,
    sourceDomain: domain,
    dedupeKey: buildDedupeKey(domain, input.title, input.publishedAt),
  };
}

async function loadTopic(topicId: string): Promise<TopicSyncInput | null> {
  const topic = await db.query.topics.findFirst({ where: eq(topics.id, topicId) });
  if (!topic || !topic.active) {
    return null;
  }

  const attachedFeeds = await db
    .select({
      feedId: topicFeeds.feedId,
    })
    .from(topicFeeds)
    .where(eq(topicFeeds.topicId, topic.id));

  const feedIds = attachedFeeds.map((row) => row.feedId);
  const feedRecords = feedIds.length
    ? await db.query.feeds.findMany({ where: inArray(feeds.id, feedIds) })
    : [];

  const activeFeeds = feedRecords
    .filter((feed) => feed.active)
    .map((feed) => ({
      name: feed.name,
      url: feed.url,
      type: feed.type,
    }));

  return {
    topicId: topic.id,
    topicName: topic.name,
    category: topic.category,
    window: topic.window,
    rules: normalizeRules({
      includeTerms: topic.includeTerms,
      excludeTerms: topic.excludeTerms,
      exactPhrases: topic.exactPhrases,
    }),
    feeds: activeFeeds,
    queryText: topic.queryText,
  };
}

async function upsertArticle(record: NormalizedArticleRecord): Promise<{ id: string }> {
  const rows = await db
    .insert(articles)
    .values({
      id: newId(),
      sourceType: record.sourceType,
      sourceName: record.sourceName,
      sourceDomain: record.sourceDomain,
      title: record.title,
      url: record.url,
      canonicalUrl: record.canonicalUrl,
      dedupeKey: record.dedupeKey,
      publishedAt: record.publishedAt,
      summarySnippet: record.summarySnippet,
      rawPayload: record.rawPayload,
    })
    .onConflictDoUpdate({
      target: articles.dedupeKey,
      set: {
        sourceName: record.sourceName,
        sourceDomain: record.sourceDomain,
        title: record.title,
        url: record.url,
        canonicalUrl: record.canonicalUrl,
        publishedAt: record.publishedAt,
        summarySnippet: record.summarySnippet,
        rawPayload: record.rawPayload,
      },
    })
    .returning({ id: articles.id });

  return rows[0];
}

async function recordJobStart(jobName: string, trigger: "scheduler" | "backfill" | "manual") {
  const id = newId();
  await db.insert(jobRuns).values({
    id,
    jobName,
    trigger,
    status: "running",
  });
  return id;
}

async function recordJobCompletion(
  jobId: string,
  status: "success" | "failed",
  counters: JobCounters,
  errorMessage?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db
    .update(jobRuns)
    .set({
      status,
      finishedAt: new Date(),
      fetchedCount: counters.fetchedCount,
      dedupedCount: counters.dedupedCount,
      vettedCount: counters.vettedCount,
      summarizedCount: counters.summarizedCount,
      skippedCount: counters.skippedCount,
      tokenUsage: counters.tokenUsage,
      errorMessage: errorMessage ?? null,
      metadata: metadata ?? {},
    })
    .where(eq(jobRuns.id, jobId));
}

function dedupeRecords(records: NormalizedArticleRecord[]): NormalizedArticleRecord[] {
  const map = new Map<string, NormalizedArticleRecord>();

  for (const record of records) {
    if (!map.has(record.dedupeKey)) {
      map.set(record.dedupeKey, record);
    }
  }

  return [...map.values()];
}

export async function runTopicSync(topicId: string, trigger: "scheduler" | "backfill" | "manual") {
  const counters: JobCounters = {
    fetchedCount: 0,
    dedupedCount: 0,
    vettedCount: 0,
    summarizedCount: 0,
    skippedCount: 0,
    tokenUsage: 0,
  };

  const jobId = await recordJobStart(`topic_sync:${topicId}`, trigger);

  try {
    const topic = await loadTopic(topicId);
    if (!topic) {
      await recordJobCompletion(jobId, "failed", counters, "Topic missing or inactive");
      return;
    }

    const query = buildGoogleNewsQuery(topic.topicName, topic.rules, topic.queryText);
    const googleArticles = await fetchGoogleNewsArticles(query);
    const customLists = await Promise.all(
      topic.feeds.map((feed) => {
        if (feed.type === "google_query") {
          return fetchGoogleNewsArticles(feed.url);
        }
        return fetchRssFeed(feed.url, "custom_rss", feed.name);
      })
    );

    const fetched = [...googleArticles, ...customLists.flat()];
    counters.fetchedCount = fetched.length;

    const cutoff = computeWindowCutoff(topic.window);
    const normalized = fetched
      .filter((article) => article.publishedAt >= cutoff)
      .map((article) => normalizeArticle(article));

    const deduped = dedupeRecords(normalized);
    counters.dedupedCount = deduped.length;

    const ranked: RankedCandidate[] = [];

    for (const article of deduped) {
      const persisted = await upsertArticle(article);
      const haystack = `${article.title} ${article.summarySnippet}`;

      const keyword = scoreKeywordMatch(haystack, topic.rules);
      if (keyword.rejected) {
        counters.skippedCount += 1;
        continue;
      }

      const impact = classifyMarketImpact(haystack);
      const freshness = freshnessScore(article.publishedAt);
      const trust = sourceTrustScore(article.sourceDomain);
      const score = computeVettingScore({
        marketImpact: impact.score,
        keywordMatch: keyword.score,
        freshness,
        sourceTrust: trust,
      });

      if (score < MIN_VETTING_SCORE) {
        counters.skippedCount += 1;
        continue;
      }

      ranked.push({
        articleId: persisted.id,
        topicId: topic.topicId,
        window: topic.window,
        title: article.title,
        summarySnippet: article.summarySnippet,
        sourceDomain: article.sourceDomain,
        canonicalUrl: article.canonicalUrl,
        publishedAt: article.publishedAt,
        score,
        impactClass: impact.impactClass,
        breakdown: {
          marketImpact: impact.score,
          keywordMatch: keyword.score,
          freshness,
          sourceTrust: trust,
          reasons: [...impact.matchedSignals, ...keyword.matchedTerms.map((term) => `matched:${term}`)],
        },
      });
    }

    const vetted = rankVettedCandidates(ranked).slice(0, MAX_VETTED);
    counters.vettedCount = vetted.length;

    for (const [index, candidate] of vetted.entries()) {
      await db
        .insert(topicMatches)
        .values({
          id: newId(),
          topicId: candidate.topicId,
          articleId: candidate.articleId,
          window: candidate.window,
          impactClass: candidate.impactClass,
          rank: index + 1,
          isVetted: true,
          vettingScore: candidate.score,
          vettingBreakdown: candidate.breakdown,
        })
        .onConflictDoUpdate({
          target: [topicMatches.topicId, topicMatches.articleId, topicMatches.window],
          set: {
            impactClass: candidate.impactClass,
            rank: index + 1,
            vettingScore: candidate.score,
            vettingBreakdown: candidate.breakdown,
            matchedAt: new Date(),
          },
        });
    }

    const summaryCandidates = pickSummaryCandidates(vetted);
    const summaryCandidateArticleIds = summaryCandidates.map((candidate) => candidate.articleId);
    const existingSummaryRows =
      summaryCandidateArticleIds.length > 0
        ? await db
            .select({
              topicId: summaries.topicId,
              articleId: summaries.articleId,
              window: summaries.window,
            })
            .from(summaries)
            .where(
              and(
                eq(summaries.topicId, topic.topicId),
                eq(summaries.window, topic.window),
                inArray(summaries.articleId, summaryCandidateArticleIds)
              )
            )
        : [];

    const existingCacheKeys = new Set(
      existingSummaryRows.map((row) => `${row.topicId}:${row.articleId}:${row.window}`)
    );
    const uncachedSummaryCandidates = filterUncachedCandidates(summaryCandidates, existingCacheKeys);
    counters.skippedCount += summaryCandidates.length - uncachedSummaryCandidates.length;

    for (const candidate of uncachedSummaryCandidates) {

      const generated = await summarizeArticle({
        topicName: topic.topicName,
        articleTitle: candidate.title,
        articleSnippet: candidate.summarySnippet,
        articleUrl: candidate.canonicalUrl,
        sourceDomain: candidate.sourceDomain,
        publishedAt: candidate.publishedAt,
      });

      await db.insert(summaries).values({
        id: newId(),
        topicId: candidate.topicId,
        articleId: candidate.articleId,
        window: candidate.window,
        headline: generated.headline,
        bullets: generated.bullets,
        sourceLink: candidate.canonicalUrl,
        publishedAt: candidate.publishedAt,
        model: generated.model,
        promptTokens: generated.promptTokens,
        completionTokens: generated.completionTokens,
        totalTokens: generated.totalTokens,
      });

      counters.summarizedCount += 1;
      counters.tokenUsage += generated.totalTokens;
    }

    await recordJobCompletion(jobId, "success", counters, undefined, {
      topicId,
      query,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Topic sync failed";
    await recordJobCompletion(jobId, "failed", counters, message);
    throw error;
  }
}

export async function runHourlyTopicSync(): Promise<void> {
  const run = await withAdvisoryLock("job:marketfilter-hourly", async () => {
    const activeTopics = await db
      .select({ id: topics.id })
      .from(topics)
      .where(eq(topics.active, true));

    for (const topic of activeTopics) {
      await runTopicSync(topic.id, "scheduler");
    }
  });

  if (run === null) {
    return;
  }
}

export async function runWatchTopicBackfill(watchTopicId: string): Promise<void> {
  const item = await db.query.watchTopics.findFirst({ where: eq(watchTopics.id, watchTopicId) });
  if (!item?.linkedTopicId) {
    return;
  }

  await runTopicSync(item.linkedTopicId, "backfill");
}

export async function latestJobRuns(limit = 20) {
  return db.query.jobRuns.findMany({
    orderBy: [desc(jobRuns.startedAt)],
    limit,
  });
}

