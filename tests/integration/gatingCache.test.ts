import { filterUncachedCandidates, pickSummaryCandidates } from "../../server/services/news/syncTopic";

const sampleCandidates = Array.from({ length: 8 }).map((_, index) => ({
  articleId: `article-${index + 1}`,
  topicId: "topic-1",
  window: "24h" as const,
  title: `Title ${index + 1}`,
  summarySnippet: "snippet",
  sourceDomain: "example.com",
  canonicalUrl: `https://example.com/${index + 1}`,
  publishedAt: new Date(`2026-04-05T0${Math.min(index, 9)}:00:00Z`),
  score: 1 - index * 0.05,
  impactClass: "general" as const,
  breakdown: {
    marketImpact: 0.8,
    keywordMatch: 0.8,
    freshness: 0.7,
    sourceTrust: 0.7,
    reasons: [],
  },
}));

describe("gating and cache reuse", () => {
  it("keeps only top 5 summaries from ranked candidates", () => {
    const picked = pickSummaryCandidates(sampleCandidates);
    expect(picked.length).toBe(5);
    expect(picked[0].articleId).toBe("article-1");
    expect(picked[4].articleId).toBe("article-5");
  });

  it("skips cached summary keys", () => {
    const picked = pickSummaryCandidates(sampleCandidates);
    const cache = new Set(["topic-1:article-1:24h", "topic-1:article-3:24h"]);
    const uncached = filterUncachedCandidates(picked, cache);

    expect(uncached.map((item) => item.articleId)).toEqual(["article-2", "article-4", "article-5"]);
  });
});