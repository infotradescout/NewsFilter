import type { Express } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { summaries, topics, userWatchTopics, users, watchTopics } from "../../shared/schema";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";

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

export function registerDashboardRoutes(app: Express): void {
  app.get("/api/dashboard/data", requireAuth, async (req, res) => {
    const user = req.session.user!;

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
                }
              : null,
          };
        })
    );

    res.json({
      topics: topicCards,
      watchTopics: watchCards,
      defaultPriceSymbols: DEFAULT_PRICE_SYMBOLS,
    });
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
      const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
        symbolsRaw.join(",")
      )}`;

      const response = await fetch(quoteUrl, {
        headers: {
          "User-Agent": "NewsFilter/1.0",
        },
      });
      if (!response.ok) {
        throw new Error(`Price API HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
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
      };

      const result = payload.quoteResponse?.result ?? [];
      const bySymbol = new Map(result.map((item) => [item.symbol, item]));

      const quotes = symbolsRaw
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

      res.json({ quotes });
    } catch {
      res.json({ quotes: [] });
    }
  });
}
