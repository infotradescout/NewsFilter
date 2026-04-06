import { classifyMarketImpact } from "../../server/services/news/marketImpact";

describe("market impact classifier", () => {
  it("detects central bank events", () => {
    const result = classifyMarketImpact("Fed signals potential rate cut after FOMC meeting.");
    expect(result.impactClass).toBe("central_banks");
    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });

  it("falls back to general class", () => {
    const result = classifyMarketImpact("A company published general strategy commentary.");
    expect(result.impactClass).toBe("general");
  });
});