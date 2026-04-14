import { useEffect, useMemo, useState } from "react";
import type { LisaFeedBuildResult } from "../api";
import { api } from "../api";

function scoreLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatPrettyJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

function freshnessLabel(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  const ageMinutes = Math.max(1, Math.round(ageMs / 60_000));
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  const hours = Math.round(ageMinutes / 60);
  return `${hours}h ago`;
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export default function LisaFeedPage() {
  const [feed, setFeed] = useState<LisaFeedBuildResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sinceLastPublish, setSinceLastPublish] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadFeed(options?: { since?: boolean }) {
    const since = options?.since ?? sinceLastPublish;
    setLoading(true);
    setError(null);
    try {
      const response = await api.getLisaFeed(since);
      setFeed(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load LISA feed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFeed({ since: sinceLastPublish });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceLastPublish]);

  const payloadJson = useMemo(() => (feed ? formatPrettyJson(feed.payload) : "{}"), [feed]);
  const payloadNdjson = feed?.ndjson ?? "";

  async function publishLatest() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const published = await api.publishLisaFeed(sinceLastPublish);
      setMessage(
        `Published ${published.packet_count} packets (${published.item_count} items) at ${new Date(published.published_at).toLocaleString()}.`
      );
      await loadFeed({ since: sinceLastPublish });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish LISA feed");
    } finally {
      setBusy(false);
    }
  }

  function exportPayload(format: "json" | "ndjson") {
    window.open(api.exportLisaFeedUrl(format, sinceLastPublish), "_blank", "noopener,noreferrer");
  }

  return (
    <section className="page-stack">
      <header className="page-header-row">
        <div>
          <h2>LISA Feed</h2>
          <p>Topic-impact intelligence packets for LISA ingestion.</p>
        </div>
        <button onClick={() => void loadFeed({ since: sinceLastPublish })} disabled={loading || busy}>
          {loading ? "Generating..." : "Generate latest feed"}
        </button>
      </header>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <section className="panel stack">
        <div className="summary-actions">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={sinceLastPublish}
              onChange={(event) => setSinceLastPublish(event.target.checked)}
              disabled={loading || busy}
            />
            <span>Only new or changed since last publish</span>
          </label>
          <span className="tiny-meta">
            Last publish: {feed?.last_publish_at ? new Date(feed.last_publish_at).toLocaleString() : "never"}
          </span>
        </div>
        <div className="pulse-grid">
          <article className="pulse-card">
            <span>Topics</span>
            <strong>{feed?.stats.topics_considered ?? 0}</strong>
          </article>
          <article className="pulse-card">
            <span>Events</span>
            <strong>{feed?.stats.events_emitted ?? 0}</strong>
          </article>
          <article className="pulse-card">
            <span>Pulses</span>
            <strong>{feed?.stats.pulses_emitted ?? 0}</strong>
          </article>
          <article className="pulse-card">
            <span>Alerts</span>
            <strong>{feed?.stats.alerts_emitted ?? 0}</strong>
          </article>
        </div>
      </section>

      <section className="panel stack">
        <h3 className="section-title">LISA-ready Signals</h3>

        <div className="section-head">
          <h4 className="section-title">High-impact events</h4>
        </div>
        <div className="card-grid">
          {(feed?.cards.high_impact_events ?? []).map((event) => (
            <article className="summary-card" key={`${event.topic}-${event.headline}`}>
              <div className="summary-meta">
                <span>{event.topic}</span>
                <span>{event.entity}</span>
                <span>{event.lane}</span>
              </div>
              <h3>{event.headline}</h3>
              <p className="tiny-meta">Why it matters: {event.summary}</p>
              <p className="tiny-meta">Why trusted: source trust {scoreLabel(event.source_trust_score)}</p>
              <p className="tiny-meta">Freshness: {scoreLabel(event.freshness_score)} ({freshnessLabel(event.generated_at)})</p>
              <div className="summary-actions">
                {event.evidence_refs.slice(0, 2).map((ref) => (
                  <a key={ref} href={ref} target="_blank" rel="noreferrer">
                    Source
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="section-head">
          <h4 className="section-title">Topic pulses</h4>
        </div>
        <div className="card-grid">
          {(feed?.cards.topic_pulses ?? []).map((pulse) => (
            <article className="summary-card" key={`${pulse.topic}-${pulse.window}`}>
              <div className="summary-meta">
                <span>{pulse.topic}</span>
                <span>{pulse.lane}</span>
                <span>{pulse.window}</span>
              </div>
              <h3>{pulse.summary}</h3>
              <p className="tiny-meta">Trend: {pulse.trend_direction}</p>
              <p className="tiny-meta">Attention: {pulse.attention_level}</p>
              <p className="tiny-meta">Confidence: {scoreLabel(pulse.confidence)}</p>
            </article>
          ))}
        </div>

        <div className="section-head">
          <h4 className="section-title">Contradictions</h4>
        </div>
        <div className="card-grid">
          {(feed?.cards.contradictions ?? []).map((item) => (
            <article className="summary-card" key={`${item.topic}-${item.entity}-${item.claim_a}`}>
              <div className="summary-meta">
                <span>{item.topic}</span>
                <span>{item.entity}</span>
              </div>
              <p className="tiny-meta">A: {item.claim_a}</p>
              <p className="tiny-meta">B: {item.claim_b}</p>
              <p className="tiny-meta">State: {item.resolution_state}</p>
            </article>
          ))}
        </div>

        <div className="section-head">
          <h4 className="section-title">Alerts</h4>
        </div>
        <div className="card-grid">
          {(feed?.cards.alerts ?? []).map((alert) => (
            <article className="summary-card" key={`${alert.topic}-${alert.entity}-${alert.summary}`}>
              <div className="summary-meta">
                <span>{alert.topic}</span>
                <span>{alert.priority}</span>
              </div>
              <h3>{alert.summary}</h3>
              <p className="tiny-meta">Reason: {alert.reason}</p>
              <p className="tiny-meta">Attention: {alert.recommended_attention}</p>
            </article>
          ))}
        </div>

        <div className="section-head">
          <h4 className="section-title">Source trust changes</h4>
        </div>
        <div className="card-grid">
          {(feed?.cards.source_trust_changes ?? []).map((signal) => (
            <article className="summary-card" key={`${signal.topic}-${signal.source_name}`}>
              <div className="summary-meta">
                <span>{signal.topic}</span>
                <span>{signal.source_name}</span>
                <span>{signal.status}</span>
              </div>
              <p className="tiny-meta">Trust: {scoreLabel(signal.trust_weight)}</p>
              <p className="tiny-meta">Hit rate: {scoreLabel(signal.recent_hit_rate)}</p>
              <p className="tiny-meta">Contradictions: {signal.contradiction_count}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <div className="section-head">
          <h3 className="section-title">Machine Payload</h3>
          <div className="summary-actions">
            <button className="secondary" onClick={() => void copyText(payloadJson)} disabled={!feed || busy}>
              Copy JSON
            </button>
            <button className="secondary" onClick={() => void copyText(payloadNdjson)} disabled={!feed || busy}>
              Copy NDJSON
            </button>
          </div>
        </div>
        <label>
          JSON
          <textarea className="lisa-payload" readOnly value={payloadJson} />
        </label>
        <label>
          NDJSON
          <textarea className="lisa-payload" readOnly value={payloadNdjson} />
        </label>
      </section>

      <section className="panel stack">
        <h3 className="section-title">Publish Controls</h3>
        <div className="summary-actions">
          <button onClick={() => void loadFeed({ since: sinceLastPublish })} disabled={loading || busy}>
            Generate latest feed
          </button>
          <button type="button" className="secondary" onClick={() => exportPayload("json")} disabled={!feed || busy}>
            Export JSON
          </button>
          <button type="button" className="secondary" onClick={() => exportPayload("ndjson")} disabled={!feed || busy}>
            Export NDJSON
          </button>
          <button onClick={() => void publishLatest()} disabled={!feed || busy}>
            {busy ? "Publishing..." : "Publish latest packet"}
          </button>
        </div>
      </section>
    </section>
  );
}
