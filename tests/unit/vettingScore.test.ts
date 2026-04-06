import { computeVettingScore, rankVettedCandidates } from "../../server/services/news/syncTopic";

describe("vetting score", () => {
  it("weights market impact and keyword match more heavily", () => {
    const score = computeVettingScore({
      marketImpact: 1,
      keywordMatch: 0.8,
      freshness: 0.5,
      sourceTrust: 0.5,
    });

    expect(score).toBeCloseTo(0.83, 2);
  });

  it("sorts candidates by score then recency", () => {
    const ranked = rankVettedCandidates([
      {
        articleId: "a",
        topicId: "t",
        window: "24h",
        title: "A",
        summarySnippet: "",
        sourceDomain: "x.com",
        canonicalUrl: "https://x.com/a",
        publishedAt: new Date("2026-04-05T10:00:00Z"),
        score: 0.7,
        impactClass: "general",
        breakdown: { marketImpact: 0.5, keywordMatch: 0.8, freshness: 0.7, sourceTrust: 0.7, reasons: [] },
      },
      {
        articleId: "b",
        topicId: "t",
        window: "24h",
        title: "B",
        summarySnippet: "",
        sourceDomain: "x.com",
        canonicalUrl: "https://x.com/b",
        publishedAt: new Date("2026-04-05T11:00:00Z"),
        score: 0.7,
        impactClass: "general",
        breakdown: { marketImpact: 0.5, keywordMatch: 0.8, freshness: 0.7, sourceTrust: 0.7, reasons: [] },
      },
    ]);

    expect(ranked[0].articleId).toBe("b");
  });
});