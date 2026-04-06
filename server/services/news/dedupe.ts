import { createHash } from "node:crypto";

export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const paramsToStrip = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
    ];

    for (const key of paramsToStrip) {
      parsed.searchParams.delete(key);
    }

    const normalizedPath = parsed.pathname.replace(/\/$/, "");
    const normalized = `${parsed.protocol}//${parsed.host}${normalizedPath}${parsed.search}`;

    return normalized;
  } catch {
    return url.trim();
  }
}

export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export function buildDedupeKey(domain: string, title: string, publishedAt: Date): string {
  const hourBucket = Math.floor(publishedAt.getTime() / 3_600_000);
  const text = `${domain}|${normalizeTitle(title)}|${hourBucket}`;
  return createHash("sha256").update(text).digest("hex");
}