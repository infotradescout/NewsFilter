import { normalizeRules, scoreKeywordMatch } from "../../server/services/news/keywordRules";

describe("keyword rules", () => {
  it("rejects articles containing excluded terms", () => {
    const rules = normalizeRules({ includeTerms: ["fed", "rate"], excludeTerms: ["sports"], exactPhrases: [] });
    const result = scoreKeywordMatch("Fed rate move in sports market", rules);

    expect(result.rejected).toBe(true);
    expect(result.rejectedTerms).toContain("sports");
  });

  it("scores include terms and phrases", () => {
    const rules = normalizeRules({
      includeTerms: ["inflation", "cpi"],
      excludeTerms: [],
      exactPhrases: ["core inflation"],
    });

    const result = scoreKeywordMatch("Core inflation and CPI surprised analysts", rules);

    expect(result.rejected).toBe(false);
    expect(result.score).toBeGreaterThan(0.8);
    expect(result.matchedTerms).toContain("inflation");
  });
});