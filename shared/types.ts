import type { InferSelectModel } from "drizzle-orm";
import {
  articles,
  jobRuns,
  roleEnum,
  summaries,
  topics,
  topicWindowEnum,
  watchTopics,
} from "./schema";

export const roleValues = roleEnum.enumValues;
export type Role = (typeof roleValues)[number];

export const topicWindowValues = topicWindowEnum.enumValues;
export type TopicWindow = (typeof topicWindowValues)[number];

export type FinanceCategory = "macro" | "commodities" | "equities" | "crypto";
export type TopicScope = "personal" | "shared";
export type ImpactClass =
  | "central_banks"
  | "inflation_jobs"
  | "energy_shock"
  | "metals_supply"
  | "regulation"
  | "exchange_liquidity"
  | "general";

export interface TopicRuleSet {
  includeTerms: string[];
  excludeTerms: string[];
  exactPhrases: string[];
}

export interface VettingBreakdown {
  marketImpact: number;
  keywordMatch: number;
  freshness: number;
  sourceTrust: number;
  reasons: string[];
}

export type TopicRow = InferSelectModel<typeof topics>;
export type ArticleRow = InferSelectModel<typeof articles>;
export type SummaryRow = InferSelectModel<typeof summaries>;
export type WatchTopicRow = InferSelectModel<typeof watchTopics>;
export type JobRunRow = InferSelectModel<typeof jobRuns>;

export interface InboxSummaryItem {
  id: string;
  topicId: string;
  topicName: string;
  category: FinanceCategory;
  window: TopicWindow;
  headline: string;
  bullets: string[];
  sourceLink: string;
  sourceDomain: string;
  publishedAt: string;
  createdAt: string;
  read: boolean;
}

export interface JobRunStats {
  id: string;
  jobName: string;
  trigger: "scheduler" | "backfill" | "manual";
  status: "running" | "success" | "failed";
  startedAt: string;
  finishedAt: string | null;
  fetchedCount: number;
  dedupedCount: number;
  vettedCount: number;
  summarizedCount: number;
  skippedCount: number;
  tokenUsage: number;
  errorMessage: string | null;
}