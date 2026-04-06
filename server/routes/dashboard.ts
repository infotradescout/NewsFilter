import type { Express } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import {
  alertRules,
  portfolioPositions,
  summaries,
  topicMatches,
  topics,
  userPreferences,
  userWatchTopics,
  users,
  watchTopics,
} from "../../shared/schema";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { runTopicSync } from "../services/news/syncTopic";

const dashboardWidgetSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["topic", "watch", "price"]),
  refId: z.string().min(1),
  size: z.enum(["s", "m", "l"]).default("m"),
  hidden: z.boolean().default(false),
  symbol: z.string().optional(),
  label: z.string().optional(),
});

const dashboardLayoutSchema = z.object({
  widgets: z.array(dashboardWidgetSchema).default([]),
});

const saveLayoutSchema = z.object({
  layout: dashboardLayoutSchema,
});

const DEFAULT_PRICE_SYMBOLS = ["CL=F", "NG=F", "GC=F", "HG=F"];
type Tone = "positive" | "negative" | "neutral";
const DASHBOARD_CACHE_MS = 30_000;
const QUOTE_CACHE_MS = 20_000;
const dashboardCache = new Map<string, { expiresAt: number; payload: unknown }>();
const quoteCache = new Map<string, { expiresAt: number; quotes: unknown[] }>();

const POSITIVE_TERMS = [
  "beat",
  "surge",
  "rally",
  "gain",
  "strong",
  "upside",
  "upgrade",
  "easing",
  "cooling inflation",
  "record high",
  "bullish",
  "inflow",
  "rebound",
];

const NEGATIVE_TERMS = [
  "miss",
  "drop",
  "selloff",
  "plunge",
  "cut",
  "downgrade",
  "recession",
  "hot inflation",
  "shock",
  "outage",
  "default",
  "bearish",
  "outflow",
  "liquidation",
  "disruption",
];

function parseDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function classifyTone(text: string): Tone {
  const haystack = text.toLowerCase();
  let positive = 0;
  let negative = 0;

  for (const term of POSITIVE_TERMS) {
    if (haystack.includes(term)) positive += 1;
  }
  for (const term of NEGATIVE_TERMS) {
    if (haystack.includes(term)) negative += 1;
  }

  if (positive - negative >= 1) return "positive";
  if (negative - positive >= 1) return "negative";
  return "neutral";
}

async function latestSummaryForTopic(topicId: string) {
  return db.query.summaries.findFirst({
    where: eq(summaries.topicId, topicId),
    orderBy: [desc(summaries.createdAt)],
  });
}

async function getCachedQuotes(symbols: string[]) {
  const normalized = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].sort();
  if (normalized.length === 0) return [];

  const key = normalized.join(",");
  const now = Date.now();
  const cached = quoteCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.quotes;
  }

  const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(key)}`;
  const response = await fetch(quoteUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
    },
  });
  const payload = response.ok
    ? ((await response.json()) as {
        quoteResponse?: {
          result?: Array<{
            symbol?: string;
            shortName?: string;
            regularMarketPrice?: number;
            regularMarketChange?: number;
            regularMarketChangePercent?: number;
            regularMarketTime?: number;
            currency?: string;
          }>;
        };
      })
    : {};

  const result = payload.quoteResponse?.result ?? [];
  const bySymbol = new Map(result.map((item) => [item.symbol, item]));

  const quotes = normalized
    .map((symbol) => bySymbol.get(symbol))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({
      symbol: item.symbol ?? "",
      name: item.shortName ?? item.symbol ?? "",
      price: item.regularMarketPrice ?? null,
      change: item.regularMarketChange ?? null,
      changePct: item.regularMarketChangePercent ?? null,
      asOf: item.regularMarketTime ? new Date(item.regularMarketTime * 1000).toISOString() : null,
      currency: item.currency ?? "USD",
    }));

  const quotedSymbols = new Set(quotes.map((q) => q.symbol));
  const missingSymbols = normalized.filter((symbol) => !quotedSymbols.has(symbol));

  if (missingSymbols.length > 0) {
    const fallbackRows = await Promise.all(
      missingSymbols.slice(0, 20).map(async (symbol) => {
        try {
          const chartResponse = await fetch(
            `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`,
            {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                Accept: "application/json,text/plain,*/*",
              },
            }
          );
          if (!chartResponse.ok) return null;
          const chartPayload = (await chartResponse.json()) as {
            chart?: {
              result?: Array<{
                meta?: {
                  symbol?: string;
                  shortName?: string;
                  regularMarketPrice?: number;
                  chartPreviousClose?: number;
                  regularMarketTime?: number;
                  currency?: string;
                };
              }>;
            };
          };

          const meta = chartPayload.chart?.result?.[0]?.meta;
          if (!meta?.symbol || meta.regularMarketPrice === undefined || meta.regularMarketPrice === null) return null;

          const prev = meta.chartPreviousClose ?? null;
          const change = prev !== null ? meta.regularMarketPrice - prev : null;
          const changePct = prev && prev !== 0 ? (change! / prev) * 100 : null;

          return {
            symbol: meta.symbol,
            name: meta.shortName ?? meta.symbol,
            price: meta.regularMarketPrice,
            change,
            changePct,
            asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
            currency: meta.currency ?? "USD",
          };
        } catch {
          return null;
        }
      })
    );

    for (const row of fallbackRows) {
      if (row) quotes.push(row);
    }
  }

  quoteCache.set(key, {
    expiresAt: now + QUOTE_CACHE_MS,
    quotes,
  });

  return quotes;
}

export function registerDashboardRoutes(app: Express): void {
  app.get("/api/dashboard/data", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const cacheKey = user.id;
    const now = Date.now();
    const cached = dashboardCache.get(cacheKey);
    const skipCache = String(req.query.fresh || "") === "true";
    if (!skipCache && cached && cached.expiresAt > now) {
      res.json(cached.payload);
      return;
    }

    const prefs = await db.query.userPreferences.findFirst({ where: eq(userPreferences.userId, user.id) });
    const blockedDomainSet = new Set((prefs?.blockedDomains ?? []).map((d) => d.toLowerCase().replace(/^www\./, "")));
    const trustOverrides = prefs?.trustOverrides ?? {};

    const topicRows =
      user.role === "admin"
        ? await db.query.topics.findMany({
            where: eq(topics.active, true),
            orderBy: [desc(topics.createdAt)],
          })
        : await db.query.topics.findMany({
            where: and(
              eq(topics.active, true),
              or(eq(topics.scope, "shared"), and(eq(topics.scope, "personal"), eq(topics.ownerUserId, user.id)))
            ),
            orderBy: [desc(topics.createdAt)],
          });

    const followRows = await db.query.userWatchTopics.findMany({
      where: and(eq(userWatchTopics.userId, user.id), eq(userWatchTopics.isFollowing, true)),
    });
    const followedWatchIds = new Set(followRows.map((row) => row.watchTopicId));

    const watchRows = await db.query.watchTopics.findMany({
      where: eq(watchTopics.isActive, true),
      orderBy: [desc(watchTopics.createdAt)],
    });

    const topicCards = await Promise.all(
      topicRows.map(async (topic) => {
        const latest = await latestSummaryForTopic(topic.id);
        if (latest && blockedDomainSet.has(parseDomain(latest.sourceLink))) {
          return {
            id: topic.id,
            name: topic.name,
            category: topic.category,
            window: topic.window,
            scope: topic.scope,
            last: null,
          };
        }
        const latestMatch =
          latest
            ? await db.query.topicMatches.findFirst({
                where: and(
                  eq(topicMatches.topicId, topic.id),
                  eq(topicMatches.articleId, latest.articleId),
                  eq(topicMatches.window, latest.window)
                ),
              })
            : null;

        const domain = latest ? parseDomain(latest.sourceLink) : "";
        const trust = domain ? trustOverrides[domain] ?? null : null;
        return {
          id: topic.id,
          name: topic.name,
          category: topic.category,
          window: topic.window,
          scope: topic.scope,
          last: latest
            ? {
                headline: latest.headline,
                bullet: latest.bullets[0] ?? "",
                publishedAt: latest.publishedAt,
                sourceLink: latest.sourceLink,
                sourceDomain: parseDomain(latest.sourceLink),
                tone: classifyTone(`${latest.headline} ${latest.bullets[0] ?? ""}`),
                why: {
                  impactClass: latestMatch?.impactClass ?? "general",
                  score: latestMatch?.vettingScore ?? null,
                  trust,
                },
              }
            : null,
        };
      })
    );

    const watchCards = await Promise.all(
      watchRows
        .filter((item) => followedWatchIds.has(item.id))
        .map(async (item) => {
          const latest = item.linkedTopicId ? await latestSummaryForTopic(item.linkedTopicId) : null;
          if (latest && blockedDomainSet.has(parseDomain(latest.sourceLink))) {
            return {
              id: item.id,
              name: item.name,
              category: item.category,
              queryText: item.queryText,
              last: null,
            };
          }
          const latestMatch =
            latest && item.linkedTopicId
              ? await db.query.topicMatches.findFirst({
                  where: and(
                    eq(topicMatches.topicId, item.linkedTopicId),
                    eq(topicMatches.articleId, latest.articleId),
                    eq(topicMatches.window, latest.window)
                  ),
                })
              : null;
          const domain = latest ? parseDomain(latest.sourceLink) : "";
          const trust = domain ? trustOverrides[domain] ?? null : null;
          return {
            id: item.id,
            name: item.name,
            category: item.category,
            queryText: item.queryText,
            last: latest
              ? {
                  headline: latest.headline,
                  bullet: latest.bullets[0] ?? "",
                  publishedAt: latest.publishedAt,
                  sourceLink: latest.sourceLink,
                  sourceDomain: parseDomain(latest.sourceLink),
                  tone: classifyTone(`${latest.headline} ${latest.bullets[0] ?? ""}`),
                  why: {
                    impactClass: latestMatch?.impactClass ?? "general",
                    score: latestMatch?.vettingScore ?? null,
                    trust,
                  },
                }
              : null,
          };
        })
    );

    const positions = await db.query.portfolioPositions.findMany({
      where: and(eq(portfolioPositions.userId, user.id), eq(portfolioPositions.active, true)),
      orderBy: [desc(portfolioPositions.updatedAt)],
      limit: 80,
    });

    const alertRuleRows = await db.query.alertRules.findMany({
      where: and(eq(alertRules.userId, user.id), eq(alertRules.enabled, true)),
      orderBy: [desc(alertRules.updatedAt)],
      limit: 50,
    });

    const payload = {
      topics: topicCards,
      watchTopics: watchCards,
      defaultPriceSymbols: DEFAULT_PRICE_SYMBOLS,
      portfolio: positions,
      alertRules: alertRuleRows,
    };
    dashboardCache.set(cacheKey, {
      expiresAt: now + DASHBOARD_CACHE_MS,
      payload,
    });

    res.json(payload);
  });

  app.post("/api/dashboard/refresh", requireAuth, async (req, res) => {
    const user = req.session.user!;
    const accessTopics =
      user.role === "admin"
        ? await db.query.topics.findMany({ where: eq(topics.active, true) })
        : await db.query.topics.findMany({
            where: and(
              eq(topics.active, true),
              or(eq(topics.scope, "shared"), and(eq(topics.scope, "personal"), eq(topics.ownerUserId, user.id)))
            ),
          });

    const topicIds = accessTopics.map((topic) => topic.id);
    for (const topicId of topicIds) {
      void runTopicSync(topicId, "manual").catch((error) => {
        console.error("[dashboard] manual refresh failed", error);
      });
    }

    dashboardCache.delete(user.id);
    res.status(202).json({ ok: true, queuedTopics: topicIds.length });
  });

  app.get("/api/dashboard/layout", requireAuth, async (req, res) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, req.session.user!.id) });
    const parsed = dashboardLayoutSchema.safeParse(user?.dashboardLayout ?? {});
    res.json({
      layout: parsed.success ? parsed.data : { widgets: [] },
    });
  });

  app.put("/api/dashboard/layout", requireAuth, async (req, res) => {
    const parsed = saveLayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid dashboard layout payload" });
      return;
    }

    await db
      .update(users)
      .set({
        dashboardLayout: parsed.data.layout,
      })
      .where(eq(users.id, req.session.user!.id));
    dashboardCache.delete(req.session.user!.id);

    res.json({ ok: true });
  });

  app.get("/api/market/prices", requireAuth, async (req, res) => {
    const symbolsRaw = String(req.query.symbols || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30);

    if (symbolsRaw.length === 0) {
      res.json({ quotes: [] });
      return;
    }

    try {
      const quotes = await getCachedQuotes(symbolsRaw);
      res.json({ quotes });
    } catch {
      res.json({ quotes: [] });
    }
  });
}
