import Parser from "rss-parser";
import { buildGoogleNewsRssUrl } from "./googleRss";
import type { NormalizedArticleInput } from "./types";

type FeedItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  content?: string;
  creator?: string;
};

const parser = new Parser<Record<string, unknown>, FeedItem>();
const FEED_TIMEOUT_MS = 12_000;

async function parseFeedWithTimeout(feedUrl: string) {
  return Promise.race([
    parser.parseURL(feedUrl),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Feed fetch timeout")), FEED_TIMEOUT_MS);
    }),
  ]);
}

function toDate(value?: string): Date {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function fetchRssFeed(
  feedUrl: string,
  sourceType: "google_news" | "custom_rss",
  sourceNameHint?: string
): Promise<NormalizedArticleInput[]> {
  try {
    const feed = await parseFeedWithTimeout(feedUrl);
    const sourceName = sourceNameHint || feed.title || "Unknown Source";

    return (feed.items || [])
      .map((item) => {
        if (!item.title || !item.link) {
          return null;
        }

        return {
          sourceType,
          sourceName,
          title: item.title,
          url: item.link,
          publishedAt: toDate(item.isoDate || item.pubDate),
          summarySnippet: (item.contentSnippet || item.content || "").slice(0, 500),
          rawPayload: {
            creator: item.creator,
            sourceName,
            feedUrl,
          },
        } as NormalizedArticleInput;
      })
      .filter((entry): entry is NormalizedArticleInput => Boolean(entry));
  } catch {
    return [];
  }
}

export async function fetchGoogleNewsArticles(query: string): Promise<NormalizedArticleInput[]> {
  if (!query.trim()) {
    return [];
  }
  const url = buildGoogleNewsRssUrl(query);
  return fetchRssFeed(url, "google_news", "Google News");
}
