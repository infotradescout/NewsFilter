import { useEffect, useState } from "react";
import type { InboxItem } from "../api";
import { api } from "../api";

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listInbox();
      setItems(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function markRead(itemId: string) {
    await api.markRead(itemId);
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, read: true } : item)));
  }

  return (
    <section className="page-stack">
      <header className="page-header-row">
        <div>
          <h2>Inbox</h2>
          <p>Ultra-brief, market-impact-first summaries.</p>
        </div>
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </header>

      {loading ? <p>Loading inbox...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="card-grid">
        {items.map((item) => (
          <article className={`summary-card ${item.read ? "is-read" : ""}`} key={item.id}>
            <div className="summary-meta">
              <span>{item.category}</span>
              <span>{item.window}</span>
              <span>{new Date(item.publishedAt).toLocaleString()}</span>
            </div>
            <h3>{item.headline}</h3>
            <ul>
              {item.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <p>
              <strong>{item.topicName}</strong> · {item.sourceDomain}
            </p>
            <div className="summary-actions">
              <a href={item.sourceLink} target="_blank" rel="noreferrer">
                Open source
              </a>
              {!item.read ? <button onClick={() => void markRead(item.id)}>Mark read</button> : <span>Read</span>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}