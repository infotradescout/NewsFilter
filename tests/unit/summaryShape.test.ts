import { enforceSummaryShape } from "../../server/services/news/summarize";

describe("summary shape", () => {
  it("enforces ultra-brief headline and bullet caps", () => {
    const result = enforceSummaryShape(
      "This is a very long headline that should be compressed to the required short length",
      [
        "First bullet should also be aggressively shortened to reduce token usage and keep wording tiny.",
        "Second bullet should be short enough as well for strict compact output formatting.",
        "Third bullet should be dropped.",
      ]
    );

    expect(result.headline.split(/\s+/).length).toBeLessThanOrEqual(12);
    expect(result.bullets.length).toBeLessThanOrEqual(1);
    expect(result.bullets[0].split(/\s+/).length).toBeLessThanOrEqual(18);
  });
});
