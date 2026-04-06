import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Feed, FinanceCategory, Topic, TopicWindow } from "../api";
import { api } from "../api";

function toList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function TopicsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<FinanceCategory>("macro");
  const [scope, setScope] = useState<"personal" | "shared">("personal");
  const [windowValue, setWindowValue] = useState<TopicWindow>("24h");
  const [includeTerms, setIncludeTerms] = useState("");
  const [excludeTerms, setExcludeTerms] = useState("");
  const [exactPhrases, setExactPhrases] = useState("");
  const [selectedFeedIds, setSelectedFeedIds] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [topicRes, feedRes] = await Promise.all([api.listTopics(), api.listFeeds()]);
      setTopics(topicRes.topics);
      setFeeds(feedRes.feeds.filter((feed) => feed.active));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load topics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await api.createTopic({
        name,
        category,
        scope,
        window: windowValue,
        rules: {
          includeTerms: toList(includeTerms),
          excludeTerms: toList(excludeTerms),
          exactPhrases: toList(exactPhrases),
        },
        feedIds: selectedFeedIds,
      });

      setName("");
      setIncludeTerms("");
      setExcludeTerms("");
      setExactPhrases("");
      setSelectedFeedIds([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create topic");
    }
  }

  async function triggerBackfill(topicId: string) {
    await api.backfillTopic(topicId);
  }

  async function removeTopic(topicId: string) {
    await api.deleteTopic(topicId);
    await load();
  }

  function toggleFeed(feedId: string, checked: boolean) {
    setSelectedFeedIds((prev) => {
      if (checked) return [...prev, feedId];
      return prev.filter((id) => id !== feedId);
    });
  }

  return (
    <section className="page-stack">
      <header className="page-header-row">
        <div>
          <h2>Topics</h2>
          <p>Manage tracked macro, commodity, equity, and crypto themes.</p>
        </div>
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </header>

      <form onSubmit={handleCreate} className="panel stack">
        <h3>Create topic</h3>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value as FinanceCategory)}>
            <option value="macro">Macro</option>
            <option value="commodities">Commodities</option>
            <option value="equities">Equities</option>
            <option value="crypto">Crypto</option>
          </select>
        </label>
        <label>
          Scope
          <select value={scope} onChange={(event) => setScope(event.target.value as "personal" | "shared")}> 
            <option value="personal">Personal</option>
            <option value="shared">Shared</option>
          </select>
        </label>
        <label>
          Time window
          <select value={windowValue} onChange={(event) => setWindowValue(event.target.value as TopicWindow)}>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
          </select>
        </label>
        <label>
          Include terms (comma separated)
          <input value={includeTerms} onChange={(event) => setIncludeTerms(event.target.value)} />
        </label>
        <label>
          Exclude terms (comma separated)
          <input value={excludeTerms} onChange={(event) => setExcludeTerms(event.target.value)} />
        </label>
        <label>
          Exact phrases (comma separated)
          <input value={exactPhrases} onChange={(event) => setExactPhrases(event.target.value)} />
        </label>

        <fieldset className="feed-box">
          <legend>Attach feeds</legend>
          {feeds.map((feed) => (
            <label key={feed.id} className="checkbox-row">
              <input
                type="checkbox"
                checked={selectedFeedIds.includes(feed.id)}
                onChange={(event) => toggleFeed(feed.id, event.target.checked)}
              />
              <span>
                {feed.name} ({feed.type})
              </span>
            </label>
          ))}
        </fieldset>

        {error ? <p className="error">{error}</p> : null}
        <button type="submit">Create topic</button>
      </form>

      <div className="card-grid">
        {topics.map((topic) => (
          <article key={topic.id} className="panel stack">
            <h3>{topic.name}</h3>
            <p>
              {topic.category} · {topic.scope} · {topic.window}
            </p>
            <p>
              Include: {(topic.includeTerms || []).join(", ") || "none"}
              <br />
              Exclude: {(topic.excludeTerms || []).join(", ") || "none"}
            </p>
            <div className="summary-actions">
              <button onClick={() => void triggerBackfill(topic.id)}>Backfill now</button>
              <button onClick={() => void removeTopic(topic.id)} className="danger">
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}