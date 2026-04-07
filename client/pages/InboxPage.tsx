import { useEffect, useState } from "react";
import type { InboxItem } from "../api";
import { api } from "../api";
import { categoryLabel } from "../labels";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trimEnd()}…`;
}

function classifyTone(text: string): "pos" | "neg" | "flat" {
  const t = text.toLowerCase();
  const positive = ["beats", "rise", "rises", "surge", "gains", "up", "bull", "record high", "strong"];
  const negative = ["misses", "fall", "falls", "drop", "drops", "down", "bear", "cuts", "warning", "weak"];
  if (positive.some((token) => t.includes(token))) return "pos";
  if (negative.some((token) => t.includes(token))) return "neg";
  return "flat";
}

function conciseLine(item: InboxItem): string {
  const headline = item.headline.trim();
  const bullet = (item.bullets[0] ?? "").trim();
  if (!bullet) return "Market signal updated.";
  const h = headline.toLowerCase();
  const b = bullet.toLowerCase();
  if (h === b || b.includes(h)) return "Potential market-moving update.";
  return bullet;
}

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "macro" | "commodities" | "equities" | "crypto">("all");
  const [toneFilter, setToneFilter] = useState<"all" | "pos" | "neg" | "flat">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load({ silent = false }: { silent?: boolean } = {}) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await api.listInbox();
      setItems(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inbox");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function markRead(itemId: string) {
    await api.markRead(itemId);
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, read: true } : item)));
  }

  async function refreshNow() {
    setRefreshing(true);
    setError(null);
    setMessage(null);
    const baselineCreatedAt = items[0]?.createdAt ?? null;

    try {
      const response = await api.refreshInbox();
      let foundNew = false;

      for (let attempt = 0; attempt < 8; attempt += 1) {
        await sleep(2500);
        const inbox = await api.listInbox();
        setItems(inbox.items);

        if (!baselineCreatedAt) {
          if (inbox.items.length > 0) {
            foundNew = true;
            break;
          }
          continue;
        }

        const latest = inbox.items[0]?.createdAt ?? baselineCreatedAt;
        if (new Date(latest).getTime() > new Date(baselineCreatedAt).getTime()) {
          foundNew = true;
          break;
        }
      }

      if (foundNew) {
        setMessage("Fresh updates loaded.");
      } else {
        setMessage(
          response.queuedTopics > 0
            ? "Refresh started. New cards usually arrive within 1-2 minutes."
            : "No active topics to refresh yet."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh inbox");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="page-stack">
      <header className="page-header-row">
        <div>
          <h2>Updates</h2>
          <p>Fast cards for quick decisions.</p>
        </div>
        <button onClick={() => void refreshNow()} disabled={loading || refreshing}>
          {refreshing ? "Refreshing..." : "Refresh now"}
        </button>
      </header>

      {loading ? <p>Loading inbox...</p> : null}
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <section className="panel stack">
        <div className="summary-actions">
          <button
            type="button"
            className={categoryFilter === "all" ? "" : "secondary"}
            onClick={() => setCategoryFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={categoryFilter === "macro" ? "" : "secondary"}
            onClick={() => setCategoryFilter("macro")}
          >
            Economy
          </button>
          <button
            type="button"
            className={categoryFilter === "commodities" ? "" : "secondary"}
            onClick={() => setCategoryFilter("commodities")}
          >
            Commodities
          </button>
          <button
            type="button"
            className={categoryFilter === "equities" ? "" : "secondary"}
            onClick={() => setCategoryFilter("equities")}
          >
            Equities
          </button>
          <button
            type="button"
            className={categoryFilter === "crypto" ? "" : "secondary"}
            onClick={() => setCategoryFilter("crypto")}
          >
            Crypto
          </button>
        </div>
        <div className="summary-actions">
          <button type="button" className={toneFilter === "all" ? "" : "secondary"} onClick={() => setToneFilter("all")}>
            Any tone
          </button>
          <button type="button" className={toneFilter === "pos" ? "" : "secondary"} onClick={() => setToneFilter("pos")}>
            Positive
          </button>
          <button type="button" className={toneFilter === "neg" ? "" : "secondary"} onClick={() => setToneFilter("neg")}>
            Negative
          </button>
          <button type="button" className={toneFilter === "flat" ? "" : "secondary"} onClick={() => setToneFilter("flat")}>
            Neutral
          </button>
          <label className="checkbox-row">
            <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
            <span>Unread only</span>
          </label>
        </div>
      </section>

      <div className="card-grid compact-feed">
        {items
          .filter((item) => (categoryFilter === "all" ? true : item.category === categoryFilter))
          .filter((item) => (toneFilter === "all" ? true : classifyTone(`${item.headline} ${item.bullets[0] ?? ""}`) === toneFilter))
          .filter((item) => (unreadOnly ? !item.read : true))
          .map((item) => (
          <article
            className={`summary-card summary-card-compact tone-${classifyTone(`${item.headline} ${item.bullets[0] ?? ""}`)} ${item.read ? "is-read" : ""}`}
            key={item.id}
          >
            <div className="summary-meta">
              <span>{categoryLabel(item.category)}</span>
              <span>{item.window}</span>
              <span>{new Date(item.publishedAt).toLocaleTimeString()}</span>
            </div>
            <h3>{truncateText(item.headline, 62)}</h3>
            <p className="summary-line">{truncateText(conciseLine(item), 62)}</p>
            <div className="summary-actions">
              <a href={item.sourceLink} target="_blank" rel="noreferrer">
                Source
              </a>
              <span className="tiny-meta">{item.sourceDomain}</span>
              {!item.read ? (
                <button className="secondary mini-btn" onClick={() => void markRead(item.id)}>
                  Read
                </button>
              ) : (
                <span className="tiny-meta">Read</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
