import { FormEvent, useEffect, useState } from "react";
import type { Feed } from "../api";
import { api } from "../api";

export default function FeedsPage() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listFeeds();
      setFeeds(response.feeds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feeds");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await api.createFeed({ name, url, type: "custom_rss" });
      setName("");
      setUrl("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create feed");
    }
  }

  return (
    <section className="page-stack">
      <header className="page-header-row">
        <div>
          <h2>Feeds</h2>
          <p>Manage custom RSS feeds used by topic pipelines.</p>
        </div>
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </header>

      <form onSubmit={handleSubmit} className="panel stack">
        <h3>Add feed</h3>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          URL
          <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} required />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">Add feed</button>
      </form>

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>URL</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {feeds.map((feed) => (
              <tr key={feed.id}>
                <td>{feed.name}</td>
                <td>{feed.type}</td>
                <td>{feed.url}</td>
                <td>{feed.active ? "Active" : "Paused"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}