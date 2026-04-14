export type LisaPriority = "critical" | "high" | "medium" | "low";
export type LisaPublishStatus = "draft" | "published";

export interface LisaPacketWrapper<TItem> {
  source_system: "newsfilter";
  packet_type: string;
  generated_at: string;
  lane: "macro" | "commodities" | "equities" | "crypto" | "cross";
  priority: LisaPriority;
  summary: string;
  items: TItem[];
  evidence_refs: string[];
  fresh_until: string;
  publish_status: LisaPublishStatus;
}

export interface EventSignal {
  source_system: "newsfilter";
  source_type: "event_signal";
  generated_at: string;
  lane: "macro" | "commodities" | "equities" | "crypto";
  topic: string;
  entity: string;
  headline: string;
  summary: string;
  event_type: string;
  market_impact_score: number;
  freshness_score: number;
  source_trust_score: number;
  keyword_match_score: number;
  confidence: number;
  relevance: number;
  evidence_refs: string[];
  tags: string[];
}

export interface TopicPulsePacket {
  topic: string;
  lane: "macro" | "commodities" | "equities" | "crypto";
  window: "24h" | "7d" | "30d";
  summary: string;
  top_events: Array<{
    entity: string;
    headline: string;
    confidence: number;
    evidence_refs: string[];
  }>;
  trend_direction: "up" | "down" | "mixed";
  attention_level: "high" | "medium" | "low";
  source_mix: Record<string, number>;
  confidence: number;
  new_vs_known_ratio: number;
}

export interface SourceTrustSignal {
  source_name: string;
  topic: string;
  trust_weight: number;
  recent_hit_rate: number;
  contradiction_count: number;
  freshness_pattern: "accelerating" | "steady" | "stale";
  status: "trusted" | "watch" | "degraded";
}

export interface ContradictionSignal {
  topic: string;
  entity: string;
  claim_a: string;
  claim_b: string;
  source_a: string;
  source_b: string;
  relative_strength: number;
  resolution_state: "unresolved" | "monitoring" | "resolved";
}

export interface AlertSignal {
  topic: string;
  entity: string;
  priority: "critical" | "high" | "medium";
  reason: string;
  summary: string;
  supporting_events: Array<{
    headline: string;
    evidence_refs: string[];
  }>;
  decay_time: string;
  recommended_attention: string;
}

export interface LisaFeedPayload {
  generated_at: string;
  source_system: "newsfilter";
  last_publish_at: string | null;
  packets: Array<
    | LisaPacketWrapper<EventSignal>
    | LisaPacketWrapper<TopicPulsePacket>
    | LisaPacketWrapper<SourceTrustSignal>
    | LisaPacketWrapper<ContradictionSignal>
    | LisaPacketWrapper<AlertSignal>
  >;
}

export interface LisaFeedCards {
  high_impact_events: EventSignal[];
  topic_pulses: TopicPulsePacket[];
  contradictions: ContradictionSignal[];
  alerts: AlertSignal[];
  source_trust_changes: SourceTrustSignal[];
}

export interface LisaFeedBuildResult {
  generated_at: string;
  last_publish_at: string | null;
  cards: LisaFeedCards;
  payload: LisaFeedPayload;
  ndjson: string;
  stats: {
    topics_considered: number;
    events_emitted: number;
    pulses_emitted: number;
    trust_signals_emitted: number;
    contradictions_emitted: number;
    alerts_emitted: number;
  };
}
