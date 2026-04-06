const TRUST_BY_DOMAIN: Record<string, number> = {
  "reuters.com": 0.95,
  "bloomberg.com": 0.95,
  "wsj.com": 0.92,
  "ft.com": 0.92,
  "cnbc.com": 0.88,
  "marketwatch.com": 0.84,
  "investing.com": 0.82,
  "coindesk.com": 0.8,
  "cointelegraph.com": 0.75,
};

export function sourceTrustScore(domain: string): number {
  const host = domain.toLowerCase().replace(/^www\./, "");
  return TRUST_BY_DOMAIN[host] ?? 0.65;
}

export function freshnessScore(publishedAt: Date): number {
  const ageHours = Math.max(0, (Date.now() - publishedAt.getTime()) / 3_600_000);
  if (ageHours <= 2) return 1;
  if (ageHours <= 12) return 0.86;
  if (ageHours <= 24) return 0.72;
  if (ageHours <= 72) return 0.5;
  if (ageHours <= 168) return 0.34;
  return 0.2;
}

export function computeWindowCutoff(window: "24h" | "7d" | "30d"): Date {
  const now = Date.now();
  const hoursByWindow: Record<typeof window, number> = {
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  };

  return new Date(now - hoursByWindow[window] * 3_600_000);
}