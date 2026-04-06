import { buildDedupeKey, canonicalizeUrl } from "../../server/services/news/dedupe";

describe("dedupe helpers", () => {
  it("canonicalizes URLs by stripping tracking params", () => {
    const url = canonicalizeUrl("https://example.com/story?utm_source=x&utm_medium=y&id=1");
    expect(url).toBe("https://example.com/story?id=1");
  });

  it("creates stable dedupe key within the same hour bucket", () => {
    const a = buildDedupeKey("example.com", "Fed cuts rates", new Date("2026-04-05T12:10:00Z"));
    const b = buildDedupeKey("example.com", "Fed cuts rates", new Date("2026-04-05T12:45:00Z"));
    expect(a).toBe(b);
  });
});