import type { TopicRules } from "./types";

function quotePhrase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return `\"${trimmed.replace(/\"/g, "")}\"`;
}

export function buildGoogleNewsQuery(topicName: string, rules: TopicRules, queryText?: string | null): string {
  if (queryText && queryText.trim().length > 0) {
    return queryText.trim();
  }

  const required = rules.includeTerms.map((term) => term.trim()).filter(Boolean);
  const phrases = rules.exactPhrases.map(quotePhrase).filter(Boolean);
  const excluded = rules.excludeTerms
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => `-${term}`);

  const merged = [topicName.trim(), ...required, ...phrases, ...excluded].filter(Boolean);

  return merged.join(" ").trim();
}

export function buildGoogleNewsRssUrl(query: string): string {
  const q = encodeURIComponent(query.trim());
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}