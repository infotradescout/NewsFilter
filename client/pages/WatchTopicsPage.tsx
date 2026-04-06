import { FormEvent, useEffect, useState } from "react";
import type { WatchTopic } from "../api";
import { api } from "../api";
import { categoryHelp, categoryLabel } from "../labels";

interface WatchTopicsPageProps {
  isAdmin: boolean;
}

export default function WatchTopicsPage({ isAdmin }: WatchTopicsPageProps) {
  const [items, setItems] = useState<WatchTopic[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"macro" | "commodities" | "equities" | "crypto">("macro");
  const [queryText, setQueryText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listWatchTopics();
      setItems(response.watchTopics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load watch topics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.createWatchTopic({
        name,
        category,
        queryText,
      });
      setName("");
      setQueryText("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create watch topic");
    }
  }

  async function toggleFollow(item: WatchTopic) {
    await api.updateWatchTopic(item.id, { followed: !item.followed });
    setItems((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, followed: !entry.followed } : entry)));
  }

  async function remove(item: WatchTopic) {
    await api.deleteWatchTopic(item.id);
    await load();
  }

  return (
    <section className="page-stack">
      <header className="page-header-row">
        <div>
          <h2>Always-On Topics</h2>
          <p>Background topics that keep running every hour automatically.</p>
        </div>
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </header>

      {isAdmin ? (
        <form onSubmit={handleCreate} className="panel stack">
          <h3 className="section-title">Create always-on topic</h3>
          <div className="form-grid-2">
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Topic type
              <select value={category} onChange={(event) => setCategory(event.target.value as any)}>
                <option value="macro">{categoryLabel("macro")}</option>
                <option value="commodities">{categoryLabel("commodities")}</option>
                <option value="equities">{categoryLabel("equities")}</option>
                <option value="crypto">{categoryLabel("crypto")}</option>
              </select>
            </label>
          </div>
          <p className="muted">{categoryHelp(category)}</p>
          <label>
            Query text
            <input value={queryText} onChange={(event) => setQueryText(event.target.value)} required />
          </label>
          <button type="submit">Create watch topic</button>
        </form>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <div className="card-grid">
        {items.map((item) => (
          <article className="entity-card" key={item.id}>
            <h3>{item.name}</h3>
            <div className="meta-line">
              <span className="meta-pill">{categoryLabel(item.category)}</span>
              <span className="meta-pill">{item.isActive ? "Active" : "Paused"}</span>
              <span className="meta-pill">{item.followed ? "Following" : "Muted"}</span>
            </div>
            <p className="entity-note">{item.queryText}</p>
            <div className="summary-actions">
              <button onClick={() => void toggleFollow(item)}>{item.followed ? "Unfollow" : "Follow"}</button>
              {isAdmin ? (
                <button onClick={() => void remove(item)} className="danger">
                  Delete
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
