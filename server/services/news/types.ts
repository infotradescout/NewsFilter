import type { FinanceCategory, ImpactClass, TopicWindow, VettingBreakdown } from "../../../shared/types";

export interface TopicRules {
  includeTerms: string[];
  excludeTerms: string[];
  exactPhrases: string[];
}

export interface NormalizedArticleInput {
  sourceType: "google_news" | "custom_rss";
  sourceName: string;
  title: string;
  url: string;
  publishedAt: Date;
  summarySnippet: string;
  rawPayload: Record<string, unknown>;
}

export interface NormalizedArticleRecord extends NormalizedArticleInput {
  canonicalUrl: string;
  sourceDomain: string;
  dedupeKey: string;
}

export interface ImpactResult {
  impactClass: ImpactClass;
  score: number;
  matchedSignals: string[];
}

export interface KeywordResult {
  score: number;
  rejected: boolean;
  matchedTerms: string[];
  matchedPhrases: string[];
  rejectedTerms: string[];
}

export interface VettingResult {
  score: number;
  breakdown: VettingBreakdown;
  impactClass: ImpactClass;
}

export interface TopicSyncInput {
  feeds: Array<{
    name: string;
    url: string;
    type: "custom_rss" | "google_query";
  }>;
  topicId: string;
  topicName: string;
  category: FinanceCategory;
  window: TopicWindow;
  rules: TopicRules;
  queryText?: string | null;
}

export interface SummaryOutput {
  headline: string;
  bullets: string[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}

export interface JobCounters {
  fetchedCount: number;
  dedupedCount: number;
  vettedCount: number;
  summarizedCount: number;
  skippedCount: number;
  tokenUsage: number;
}
