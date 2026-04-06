import { FormEvent, useEffect, useState } from "react";
import type { WatchTopic } from "../api";
import { api } from "../api";

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
          <h2>Persistent Watch Topics</h2>
          <p>Always-on high-priority tracking themes.</p>
        </div>
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </header>

      {isAdmin ? (
        <form onSubmit={handleCreate} className="panel stack">
          <h3>Create watch topic</h3>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value as any)}>
              <option value="macro">Macro</option>
              <option value="commodities">Commodities</option>
              <option value="equities">Equities</option>
              <option value="crypto">Crypto</option>
            </select>
          </label>
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
          <article className="panel stack" key={item.id}>
            <h3>{item.name}</h3>
            <p>
              {item.category} · {item.isActive ? "active" : "paused"}
            </p>
            <p>{item.queryText}</p>
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