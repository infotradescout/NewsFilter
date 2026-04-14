import { addHours } from "date-fns";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import type {
  AlertSignal,
  ContradictionSignal,
  EventSignal,
  LisaFeedBuildResult,
  LisaFeedPayload,
  LisaPacketWrapper,
  SourceTrustSignal,
  TopicPulsePacket,
} from "../../../shared/lisa";
import { articles, jobRuns, summaries, topicMatches, topics } from "../../../shared/schema";
import { db } from "../../db";

const POSITIVE_TERMS = [
  "beat",
  "beats",
  "surge",
  "rally",
  "gain",
  "gains",
  "strong",
  "upside",
  "easing",
  "cooling inflation",
  "record high",
  "bullish",
  "inflow",
  "rebound",
  "upgrade",
];

const NEGATIVE_TERMS = [
  "miss",
  "misses",
  "drop",
  "drops",
  "selloff",
  "plunge",
  "cut",
  "cuts",
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
  "warning",
];

const COMMON_UPPERCASE_WORDS = new Set([
  "THE",
  "AND",
  "FOR",
  "WITH",
  "FROM",
  "THIS",
  "THAT",
  "WILL",
  "NEWS",
  "MARKET",
  "STOCK",
  "RATES",
  "PRICE",
  "OIL",
]);

type Lane = "macro" | "commodities" | "equities" | "crypto";

interface FeedUser {
  id: string;
  role: "admin" | "member";
}

interface BuildLisaFeedArgs {
  user: FeedUser;
  since_last_publish?: boolean;
}

interface Timed<T> {
  item: T;
  changedAt: Date;
}

interface EventSignalInternal extends EventSignal {
  _source_name: string;
  _tone: "positive" | "negative" | "neutral";
}

interface SummaryRow {
  summaryId: string;
  topicId: string;
  topicName: string;
  category: Lane;
  window: "24h" | "7d" | "30d";
  headline: string;
  bullets: string[];
  sourceLink: string;
  publishedAt: Date;
  sourceName: string;
  sourceDomain: string;
  impactClass: string | null;
  vettingScore: number;
  marketImpact: number;
  keywordMatch: number;
  freshness: number;
  sourceTrust: number;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function classifyTone(text: string): "positive" | "negative" | "neutral" {
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

function eventTypeFromImpact(impactClass: string | null): string {
  switch (impactClass) {
    case "central_banks":
      return "policy_shift";
    case "inflation_jobs":
      return "macro_data";
    case "energy_shock":
      return "supply_disruption";
    case "metals_supply":
      return "supply_chain_signal";
    case "regulation":
      return "regulatory_change";
    case "exchange_liquidity":
      return "liquidity_event";
    default:
      return "market_event";
  }
}

function extractEntity(topicName: string, headline: string): string {
  const tickerMatches = headline.match(/\b[A-Z]{2,5}\b/g) ?? [];
  const ticker = tickerMatches.find((token) => !COMMON_UPPERCASE_WORDS.has(token));
  if (ticker) return ticker;

  const entityPhrase = headline.match(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\b/);
  if (entityPhrase?.[1]) return entityPhrase[1];

  return topicName;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

async function getAccessibleTopics(user: FeedUser) {
  return user.role === "admin"
    ? db.query.topics.findMany({ where: eq(topics.active, true) })
    : db.query.topics.findMany({
        where: and(
          eq(topics.active, true),
          or(eq(topics.scope, "shared"), and(eq(topics.scope, "personal"), eq(topics.ownerUserId, user.id)))
        ),
      });
}

async function getLastPublishAt(userId: string): Promise<Date | null> {
  const latest = await db.query.jobRuns.findFirst({
    where: and(eq(jobRuns.jobName, `lisa_feed_publish:${userId}`), eq(jobRuns.status, "success")),
    orderBy: [desc(jobRuns.startedAt)],
  });

  return latest?.finishedAt ?? latest?.startedAt ?? null;
}

function withinHours(date: Date, hours: number): boolean {
  return Date.now() - date.getTime() <= hours * 3_600_000;
}

function packetPriorityFromCount(count: number): "critical" | "high" | "medium" | "low" {
  if (count >= 12) return "critical";
  if (count >= 6) return "high";
  if (count >= 2) return "medium";
  return "low";
}

function scoreAttention(events: EventSignalInternal[]): "high" | "medium" | "low" {
  const maxRelevance = events.reduce((max, current) => Math.max(max, current.relevance), 0);
  if (events.length >= 4 || maxRelevance >= 0.86) return "high";
  if (events.length >= 2 || maxRelevance >= 0.75) return "medium";
  return "low";
}

function trendDirection(events: EventSignalInternal[]): "up" | "down" | "mixed" {
  const tone = events.reduce((sum, event) => {
    if (event._tone === "positive") return sum + 1;
    if (event._tone === "negative") return sum - 1;
    return sum;
  }, 0);

  if (tone >= 2) return "up";
  if (tone <= -2) return "down";
  return "mixed";
}

function mapFreshnessPattern(avgFreshness: number): "accelerating" | "steady" | "stale" {
  if (avgFreshness >= 0.72) return "accelerating";
  if (avgFreshness <= 0.4) return "stale";
  return "steady";
}

function applySinceFilter<T>(items: Timed<T>[], sinceDate: Date | null, enabled: boolean): Timed<T>[] {
  if (!enabled || !sinceDate) return items;
  return items.filter((row) => row.changedAt.getTime() > sinceDate.getTime());
}

function mapPacket<T>(args: {
  packetType: string;
  generatedAtIso: string;
  lane: "macro" | "commodities" | "equities" | "crypto" | "cross";
  summary: string;
  items: T[];
  evidenceRefs: string[];
  freshUntil: Date;
  publishStatus: "draft" | "published";
}): LisaPacketWrapper<T> {
  return {
    source_system: "newsfilter",
    packet_type: args.packetType,
    generated_at: args.generatedAtIso,
    lane: args.lane,
    priority: packetPriorityFromCount(args.items.length),
    summary: args.summary,
    items: args.items,
    evidence_refs: unique(args.evidenceRefs),
    fresh_until: args.freshUntil.toISOString(),
    publish_status: args.publishStatus,
  };
}

export async function buildLisaFeed(args: BuildLisaFeedArgs): Promise<LisaFeedBuildResult> {
  const accessibleTopics = await getAccessibleTopics(args.user);
  const topicIds = accessibleTopics.map((topic) => topic.id);
  const generatedAt = new Date();
  const generatedAtIso = generatedAt.toISOString();
  const lastPublishAt = await getLastPublishAt(args.user.id);

  if (topicIds.length === 0) {
    const emptyPayload: LisaFeedPayload = {
      generated_at: generatedAtIso,
      source_system: "newsfilter",
      last_publish_at: lastPublishAt ? lastPublishAt.toISOString() : null,
      packets: [],
    };
    return {
      generated_at: generatedAtIso,
      last_publish_at: lastPublishAt ? lastPublishAt.toISOString() : null,
      cards: {
        high_impact_events: [],
        topic_pulses: [],
        contradictions: [],
        alerts: [],
        source_trust_changes: [],
      },
      payload: emptyPayload,
      ndjson: "",
      stats: {
        topics_considered: 0,
        events_emitted: 0,
        pulses_emitted: 0,
        trust_signals_emitted: 0,
        contradictions_emitted: 0,
        alerts_emitted: 0,
      },
    };
  }

  const joinedRows = await db
    .select({
      summaryId: summaries.id,
      topicId: topics.id,
      topicName: topics.name,
      category: topics.category,
      window: summaries.window,
      headline: summaries.headline,
      bullets: summaries.bullets,
      sourceLink: summaries.sourceLink,
      publishedAt: summaries.publishedAt,
      sourceName: articles.sourceName,
      sourceDomain: articles.sourceDomain,
      impactClass: topicMatches.impactClass,
      vettingScore: topicMatches.vettingScore,
      vettingBreakdown: topicMatches.vettingBreakdown,
    })
    .from(summaries)
    .innerJoin(topics, eq(topics.id, summaries.topicId))
    .innerJoin(articles, eq(articles.id, summaries.articleId))
    .leftJoin(
      topicMatches,
      and(
        eq(topicMatches.topicId, summaries.topicId),
        eq(topicMatches.articleId, summaries.articleId),
        eq(topicMatches.window, summaries.window)
      )
    )
    .where(inArray(summaries.topicId, topicIds))
    .orderBy(desc(summaries.publishedAt))
    .limit(1200);

  const rows: SummaryRow[] = joinedRows.map((row) => {
    const breakdown = row.vettingBreakdown ?? {
      marketImpact: 0,
      keywordMatch: 0,
      freshness: 0,
      sourceTrust: 0,
    };

    return {
      summaryId: row.summaryId,
      topicId: row.topicId,
      topicName: row.topicName,
      category: row.category as Lane,
      window: row.window,
      headline: row.headline,
      bullets: row.bullets,
      sourceLink: row.sourceLink,
      publishedAt: row.publishedAt,
      sourceName: row.sourceName,
      sourceDomain: row.sourceDomain,
      impactClass: row.impactClass,
      vettingScore: row.vettingScore ?? 0,
      marketImpact: Number(breakdown.marketImpact ?? 0),
      keywordMatch: Number(breakdown.keywordMatch ?? 0),
      freshness: Number(breakdown.freshness ?? 0),
      sourceTrust: Number(breakdown.sourceTrust ?? 0),
    };
  });

  const eventSignalsTimed: Array<Timed<EventSignalInternal>> = [];

  for (const row of rows) {
    const signalStrength = clamp(row.vettingScore);
    if (
      signalStrength < 0.78 ||
      row.marketImpact < 0.72 ||
      row.keywordMatch < 0.48 ||
      row.freshness < 0.35 ||
      row.sourceTrust < 0.28
    ) {
      continue;
    }

    const summary = row.bullets[0] ? `${row.bullets[0]}` : row.headline;
    const confidence = round(clamp(signalStrength * 0.55 + row.marketImpact * 0.2 + row.sourceTrust * 0.15 + row.freshness * 0.1));
    const entity = extractEntity(row.topicName, row.headline);
    const tone = classifyTone(`${row.headline} ${row.bullets[0] ?? ""}`);

    eventSignalsTimed.push({
      changedAt: row.publishedAt,
      item: {
        source_system: "newsfilter",
        source_type: "event_signal",
        generated_at: generatedAtIso,
        lane: row.category,
        topic: row.topicName,
        entity,
        headline: row.headline,
        summary,
        event_type: eventTypeFromImpact(row.impactClass),
        market_impact_score: round(row.marketImpact),
        freshness_score: round(row.freshness),
        source_trust_score: round(row.sourceTrust),
        keyword_match_score: round(row.keywordMatch),
        confidence,
        relevance: round(signalStrength),
        evidence_refs: [row.sourceLink],
        tags: unique([row.category, row.window, row.sourceDomain, row.impactClass ?? "general"]),
        _source_name: row.sourceName,
        _tone: tone,
      },
    });
  }

  const byTopic = new Map<string, EventSignalInternal[]>();
  for (const row of eventSignalsTimed) {
    const existing = byTopic.get(row.item.topic) ?? [];
    existing.push(row.item);
    byTopic.set(row.item.topic, existing);
  }

  const topicPulsesTimed: Array<Timed<TopicPulsePacket>> = [];
  const contradictionsTimed: Array<Timed<ContradictionSignal>> = [];
  const alertsTimed: Array<Timed<AlertSignal>> = [];

  for (const topic of accessibleTopics) {
    const events = (byTopic.get(topic.name) ?? []).slice(0, 8);
    if (events.length === 0) continue;
    const topicRows = rows.filter((row) => row.topicName === topic.name);

    const latestChangedAt = rows.find((row) => row.topicName === topic.name)?.publishedAt ?? generatedAt;

    const sourceMix = events.reduce<Record<string, number>>((acc, event) => {
      const source = event.tags.find((tag) => tag.includes(".")) ?? "unknown";
      acc[source] = (acc[source] ?? 0) + 1;
      return acc;
    }, {});

    const last24h = topicRows.filter((row) => withinHours(row.publishedAt, 24)).length;
    const newRatio = topicRows.length > 0 ? last24h / topicRows.length : 0;
    const confidence = events.reduce((sum, event) => sum + event.confidence, 0) / events.length;

    const topEvents = events.slice(0, 3).map((event) => ({
      entity: event.entity,
      headline: event.headline,
      confidence: event.confidence,
      evidence_refs: event.evidence_refs,
    }));

    const pulseSummary = `Top signal: ${events[0].headline}. ${events.length} high-impact vetted events in this window.`;

    topicPulsesTimed.push({
      changedAt: latestChangedAt,
      item: {
        topic: topic.name,
        lane: topic.category as Lane,
        window: topic.window,
        summary: pulseSummary,
        top_events: topEvents,
        trend_direction: trendDirection(events),
        attention_level: scoreAttention(events),
        source_mix: sourceMix,
        confidence: round(confidence),
        new_vs_known_ratio: round(newRatio),
      },
    });

    const positive = events.find((event) => event._tone === "positive");
    const negative = events.find((event) => event._tone === "negative");
    if (positive && negative && positive.entity === negative.entity) {
      contradictionsTimed.push({
        changedAt: latestChangedAt,
        item: {
          topic: topic.name,
          entity: positive.entity,
          claim_a: positive.headline,
          claim_b: negative.headline,
          source_a: positive._source_name,
          source_b: negative._source_name,
          relative_strength: round(Math.abs(positive.confidence - negative.confidence)),
          resolution_state: withinHours(latestChangedAt, 12) ? "unresolved" : "monitoring",
        },
      });
    }

    const highest = events[0];
    if (highest.market_impact_score >= 0.86 && highest.confidence >= 0.8 && highest.freshness_score >= 0.5) {
      const priority: AlertSignal["priority"] = highest.market_impact_score >= 0.93 ? "critical" : "high";
      alertsTimed.push({
        changedAt: latestChangedAt,
        item: {
          topic: topic.name,
          entity: highest.entity,
          priority,
          reason: `${highest.event_type} with elevated market impact and trusted sourcing`,
          summary: highest.summary,
          supporting_events: events.slice(0, 2).map((event) => ({
            headline: event.headline,
            evidence_refs: event.evidence_refs,
          })),
          decay_time: addHours(latestChangedAt, priority === "critical" ? 4 : 8).toISOString(),
          recommended_attention:
            priority === "critical"
              ? "Immediate analyst review in under 30 minutes"
              : "Review in the next 2 hours and monitor follow-through",
        },
      });
    }
  }

  const trustSignalsTimed: Array<Timed<SourceTrustSignal>> = [];
  const sourceTopicMap = new Map<string, SummaryRow[]>();
  for (const row of rows) {
    const key = `${row.topicName}::${row.sourceName}`;
    const existing = sourceTopicMap.get(key) ?? [];
    existing.push(row);
    sourceTopicMap.set(key, existing);
  }

  for (const [key, records] of sourceTopicMap.entries()) {
    if (records.length < 3) continue;

    const [topicName, sourceName] = key.split("::");
    const sorted = [...records].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    const recent = sorted.filter((row) => withinHours(row.publishedAt, 24));
    const previous = sorted.filter((row) => !withinHours(row.publishedAt, 24));
    if (recent.length === 0) continue;

    const recentTrust = recent.reduce((sum, row) => sum + row.sourceTrust, 0) / recent.length;
    const previousTrust = previous.length
      ? previous.reduce((sum, row) => sum + row.sourceTrust, 0) / previous.length
      : recentTrust;
    const trustShift = recentTrust - previousTrust;

    const recentHitRate = recent.filter((row) => row.vettingScore >= 0.8).length / recent.length;
    const avgFreshness = recent.reduce((sum, row) => sum + row.freshness, 0) / recent.length;

    const contradictionCount = contradictionsTimed.filter(
      (signal) => signal.item.topic === topicName && (signal.item.source_a === sourceName || signal.item.source_b === sourceName)
    ).length;

    let status: SourceTrustSignal["status"] = "trusted";
    if (recentTrust < 0.35 || contradictionCount >= 2 || trustShift <= -0.1) {
      status = "degraded";
    } else if (recentTrust < 0.5 || contradictionCount === 1 || trustShift < -0.03) {
      status = "watch";
    }

    if (status === "trusted" && Math.abs(trustShift) < 0.05 && recentHitRate >= 0.7) {
      continue;
    }

    trustSignalsTimed.push({
      changedAt: sorted[0].publishedAt,
      item: {
        source_name: sourceName,
        topic: topicName,
        trust_weight: round(recentTrust),
        recent_hit_rate: round(recentHitRate),
        contradiction_count: contradictionCount,
        freshness_pattern: mapFreshnessPattern(avgFreshness),
        status,
      },
    });
  }

  const eventSignals = applySinceFilter(eventSignalsTimed, lastPublishAt, !!args.since_last_publish)
    .sort((a, b) => b.item.relevance - a.item.relevance)
    .slice(0, 50);
  const topicPulses = applySinceFilter(topicPulsesTimed, lastPublishAt, !!args.since_last_publish)
    .sort((a, b) => b.item.confidence - a.item.confidence)
    .slice(0, 24);
  const contradictionSignals = applySinceFilter(contradictionsTimed, lastPublishAt, !!args.since_last_publish)
    .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
    .slice(0, 20);
  const alertSignals = applySinceFilter(alertsTimed, lastPublishAt, !!args.since_last_publish)
    .sort((a, b) => {
      const leftScore = a.item.priority === "critical" ? 2 : a.item.priority === "high" ? 1 : 0;
      const rightScore = b.item.priority === "critical" ? 2 : b.item.priority === "high" ? 1 : 0;
      return rightScore - leftScore;
    })
    .slice(0, 20);
  const sourceTrustSignals = applySinceFilter(trustSignalsTimed, lastPublishAt, !!args.since_last_publish)
    .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
    .slice(0, 20);

  const publishStatus: "draft" | "published" = "draft";

  const packets: LisaFeedPayload["packets"] = [
    mapPacket({
      packetType: "event_signal",
      generatedAtIso,
      lane: "cross",
      summary: `${eventSignals.length} high-impact vetted event signals ready for LISA ingestion.`,
      items: eventSignals.map((row) => {
        const { _source_name: _unusedSourceName, _tone: _unusedTone, ...signal } = row.item;
        return signal;
      }),
      evidenceRefs: eventSignals.flatMap((row) => row.item.evidence_refs),
      freshUntil: addHours(generatedAt, 6),
      publishStatus,
    }),
    mapPacket({
      packetType: "topic_pulse",
      generatedAtIso,
      lane: "cross",
      summary: `${topicPulses.length} topic pulse packets synthesized from vetted events.`,
      items: topicPulses.map((row) => row.item),
      evidenceRefs: topicPulses.flatMap((row) => row.item.top_events.flatMap((event) => event.evidence_refs)),
      freshUntil: addHours(generatedAt, 12),
      publishStatus,
    }),
    mapPacket({
      packetType: "source_trust_signal",
      generatedAtIso,
      lane: "cross",
      summary: `${sourceTrustSignals.length} source trust changes detected.`,
      items: sourceTrustSignals.map((row) => row.item),
      evidenceRefs: [],
      freshUntil: addHours(generatedAt, 24),
      publishStatus,
    }),
    mapPacket({
      packetType: "contradiction_signal",
      generatedAtIso,
      lane: "cross",
      summary: `${contradictionSignals.length} cross-source contradictions flagged.`,
      items: contradictionSignals.map((row) => row.item),
      evidenceRefs: [],
      freshUntil: addHours(generatedAt, 8),
      publishStatus,
    }),
    mapPacket({
      packetType: "alert_signal",
      generatedAtIso,
      lane: "cross",
      summary: `${alertSignals.length} high-priority alert signals currently active.`,
      items: alertSignals.map((row) => row.item),
      evidenceRefs: alertSignals.flatMap((row) => row.item.supporting_events.flatMap((event) => event.evidence_refs)),
      freshUntil: addHours(generatedAt, 6),
      publishStatus,
    }),
  ].filter((packet) => packet.items.length > 0);

  const payload: LisaFeedPayload = {
    generated_at: generatedAtIso,
    source_system: "newsfilter",
    last_publish_at: lastPublishAt ? lastPublishAt.toISOString() : null,
    packets,
  };

  return {
    generated_at: generatedAtIso,
    last_publish_at: lastPublishAt ? lastPublishAt.toISOString() : null,
    cards: {
      high_impact_events: eventSignals.map((row) => {
        const { _source_name: _unusedSourceName, _tone: _unusedTone, ...signal } = row.item;
        return signal;
      }),
      topic_pulses: topicPulses.map((row) => row.item),
      contradictions: contradictionSignals.map((row) => row.item),
      alerts: alertSignals.map((row) => row.item),
      source_trust_changes: sourceTrustSignals.map((row) => row.item),
    },
    payload,
    ndjson: packets.map((packet) => JSON.stringify(packet)).join("\n"),
    stats: {
      topics_considered: accessibleTopics.length,
      events_emitted: eventSignals.length,
      pulses_emitted: topicPulses.length,
      trust_signals_emitted: sourceTrustSignals.length,
      contradictions_emitted: contradictionSignals.length,
      alerts_emitted: alertSignals.length,
    },
  };
}
