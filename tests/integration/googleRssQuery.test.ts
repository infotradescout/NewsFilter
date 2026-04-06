import { buildGoogleNewsQuery, buildGoogleNewsRssUrl } from "../../server/services/news/googleRss";

describe("google rss query generation", () => {
  it("builds US English Google News RSS URLs", () => {
    const url = buildGoogleNewsRssUrl("fed rates");
    expect(url).toContain("hl=en-US");
    expect(url).toContain("gl=US");
    expect(url).toContain("ceid=US:en");
  });

  it("includes required terms, phrases, and excludes", () => {
    const query = buildGoogleNewsQuery(
      "Macro Watch",
      {
        includeTerms: ["fed", "rates"],
        excludeTerms: ["sports"],
        exactPhrases: ["core inflation"],
      },
      null
    );

    expect(query).toContain("fed");
    expect(query).toContain("rates");
    expect(query).toContain("\"core inflation\"");
    expect(query).toContain("-sports");
  });
});