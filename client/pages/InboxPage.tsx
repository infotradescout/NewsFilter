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

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
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

      <div className="card-grid compact-feed">
        {items.map((item) => (
          <article className={`summary-card summary-card-compact ${item.read ? "is-read" : ""}`} key={item.id}>
            <div className="summary-meta">
              <span>{categoryLabel(item.category)}</span>
              <span>{item.window}</span>
              <span>{new Date(item.publishedAt).toLocaleTimeString()}</span>
            </div>
            <h3>{truncateText(item.headline, 72)}</h3>
            <p className="summary-line">{truncateText(item.bullets[0] ?? "Market-moving update detected.", 78)}</p>
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
