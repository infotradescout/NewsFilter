import type { Express } from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { alertRules, summaries, topicMatches, topics } from "../../shared/schema";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { newId } from "../utils/id";

const createAlertRuleSchema = z.object({
  name: z.string().min(2).max(140),
  symbol: z.string().max(20).optional().nullable(),
  minAbsChangePct: z.number().min(0).max(100).optional().nullable(),
  topicId: z.string().optional().nullable(),
  tone: z.enum(["positive", "negative"]).optional().nullable(),
});

const updateAlertRuleSchema = z.object({
  name: z.string().min(2).max(140).optional(),
  enabled: z.boolean().optional(),
  symbol: z.string().max(20).optional().nullable(),
  minAbsChangePct: z.number().min(0).max(100).optional().nullable(),
  topicId: z.string().optional().nullable(),
  tone: z.enum(["positive", "negative"]).optional().nullable(),
});

function toneFromText(text: string): "positive" | "negative" | "neutral" {
  const lower = text.toLowerCase();
  const pos = ["beat", "rally", "surge", "upgrade", "easing", "inflow"].filter((w) => lower.includes(w)).length;
  const neg = ["miss", "selloff", "downgrade", "shock", "hot inflation", "outflow", "liquidation"].filter((w) =>
    lower.includes(w)
  ).length;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

export function registerAlertRoutes(app: Express): void {
  app.get("/api/alerts", requireAuth, async (req, res) => {
    const rows = await db.query.alertRules.findMany({
      where: eq(alertRules.userId, req.session.user!.id),
      orderBy: [desc(alertRules.createdAt)],
    });
    res.json({ rules: rows });
  });

  app.post("/api/alerts", requireAuth, async (req, res) => {
    const parsed = createAlertRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid alert rule payload" });
      return;
    }

    const [created] = await db
      .insert(alertRules)
      .values({
        id: newId(),
        userId: req.session.user!.id,
        name: parsed.data.name,
        symbol: parsed.data.symbol?.toUpperCase() ?? null,
        minAbsChangePct: parsed.data.minAbsChangePct ?? null,
        topicId: parsed.data.topicId ?? null,
        tone: parsed.data.tone ?? null,
      })
      .returning();

    res.status(201).json({ rule: created });
  });

  app.patch("/api/alerts/:id", requireAuth, async (req, res) => {
    const parsed = updateAlertRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid alert rule update payload" });
      return;
    }

    const [updated] = await db
      .update(alertRules)
      .set({
        ...parsed.data,
        symbol: parsed.data.symbol ? parsed.data.symbol.toUpperCase() : parsed.data.symbol,
        updatedAt: new Date(),
      })
      .where(and(eq(alertRules.id, String(req.params.id)), eq(alertRules.userId, req.session.user!.id)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Alert rule not found" });
      return;
    }

    res.json({ rule: updated });
  });

  app.delete("/api/alerts/:id", requireAuth, async (req, res) => {
    const [deleted] = await db
      .delete(alertRules)
      .where(and(eq(alertRules.id, String(req.params.id)), eq(alertRules.userId, req.session.user!.id)))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Alert rule not found" });
      return;
    }
    res.json({ ok: true });
  });

  app.get("/api/alerts/triggered", requireAuth, async (req, res) => {
    const userId = req.session.user!.id;
    const rules = await db.query.alertRules.findMany({
      where: and(eq(alertRules.userId, userId), eq(alertRules.enabled, true)),
      orderBy: [desc(alertRules.updatedAt)],
      limit: 100,
    });

    if (rules.length === 0) {
      res.json({ items: [] });
      return;
    }

    const symbols = rules.map((r) => r.symbol).filter((s): s is string => Boolean(s));
    const symbolQuotes = new Map<string, { changePct: number | null }>();
    if (symbols.length > 0) {
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`
        );
        const payload = (await response.json()) as {
          quoteResponse?: { result?: Array<{ symbol?: string; regularMarketChangePercent?: number }> };
        };
        for (const quote of payload.quoteResponse?.result ?? []) {
          if (!quote.symbol) continue;
          symbolQuotes.set(quote.symbol.toUpperCase(), {
            changePct: quote.regularMarketChangePercent ?? null,
          });
        }
      } catch {
        // swallow
      }
    }

    const accessibleTopics =
      req.session.user!.role === "admin"
        ? await db.query.topics.findMany()
        : await db.query.topics.findMany({
            where: or(eq(topics.scope, "shared"), and(eq(topics.scope, "personal"), eq(topics.ownerUserId, userId))),
          });
    const topicIdSet = new Set(accessibleTopics.map((t) => t.id));

    const recentSummaries = await db.query.summaries.findMany({
      orderBy: [desc(summaries.createdAt)],
      limit: 150,
    });
    const byTopic = new Map<string, (typeof recentSummaries)[number]>();
    for (const summary of recentSummaries) {
      if (!topicIdSet.has(summary.topicId)) continue;
      if (!byTopic.has(summary.topicId)) byTopic.set(summary.topicId, summary);
    }

    const triggered = [];
    for (const rule of rules) {
      let reasons: string[] = [];
      let hit = false;

      if (rule.symbol && rule.minAbsChangePct !== null && rule.minAbsChangePct !== undefined) {
        const quote = symbolQuotes.get(rule.symbol.toUpperCase());
        const changePct = quote?.changePct ?? null;
        if (changePct !== null && Math.abs(changePct) >= rule.minAbsChangePct) {
          hit = true;
          reasons.push(`${rule.symbol} moved ${changePct.toFixed(2)}%`);
        }
      }

      if (rule.topicId && topicIdSet.has(rule.topicId) && rule.tone) {
        const latest = byTopic.get(rule.topicId);
        if (latest) {
          const tone = toneFromText(`${latest.headline} ${(latest.bullets[0] ?? "").toString()}`);
          if (tone === rule.tone) {
            hit = true;
            reasons.push(`${latest.headline}`);
          }
        }
      }

      if (hit) {
        triggered.push({
          id: rule.id,
          name: rule.name,
          reasons,
          updatedAt: rule.updatedAt,
        });
      }
    }

    res.json({ items: triggered });
  });
}
