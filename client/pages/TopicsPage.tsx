import { FormEvent, useEffect, useState } from "react";
import type { Feed, FinanceCategory, Topic, TopicWindow } from "../api";
import { api } from "../api";
import { categoryHelp, categoryLabel } from "../labels";

function toList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function TopicsPage({ isAdmin }: { isAdmin: boolean }) {
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
        feedIds: selectedFeedIds.length > 0 ? selectedFeedIds : feeds.filter((feed) => feed.active).map((feed) => feed.id),
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
          <p>Choose what you want to follow. We turn it into short, useful updates.</p>
        </div>
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </header>

      <form onSubmit={handleCreate} className="panel stack">
        <h3 className="section-title">Create topic</h3>
        <p className="muted">Start simple. Add advanced filters only when you need tighter matching.</p>
        <div className="form-grid-2">
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Topic type
            <select value={category} onChange={(event) => setCategory(event.target.value as FinanceCategory)}>
              <option value="macro">{categoryLabel("macro")}</option>
              <option value="commodities">{categoryLabel("commodities")}</option>
              <option value="equities">{categoryLabel("equities")}</option>
              <option value="crypto">{categoryLabel("crypto")}</option>
            </select>
          </label>
          <label>
            Who can see this topic?
            <select value={scope} onChange={(event) => setScope(event.target.value as "personal" | "shared")}> 
              <option value="personal">Only me</option>
              {isAdmin ? <option value="shared">My team</option> : null}
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
        </div>
        <p className="muted">{categoryHelp(category)}</p>
        <label>
          Main keywords (comma separated)
          <input value={includeTerms} onChange={(event) => setIncludeTerms(event.target.value)} placeholder="example: inflation, federal reserve, cpi" />
        </label>

        <button type="button" className="secondary" onClick={() => setAdvancedOpen((prev) => !prev)}>
          {advancedOpen ? "Hide advanced filters" : "Show advanced filters"}
        </button>

        {advancedOpen ? (
          <>
            <label>
              Exclude words (comma separated)
              <input value={excludeTerms} onChange={(event) => setExcludeTerms(event.target.value)} />
            </label>
            <label>
              Exact phrases (comma separated)
              <input value={exactPhrases} onChange={(event) => setExactPhrases(event.target.value)} />
            </label>

            <fieldset className="feed-box">
              <legend>Choose sources manually (optional)</legend>
              <p>If none selected, all active sources are used automatically.</p>
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
          </>
        ) : null}

        {error ? <p className="error">{error}</p> : null}
        <button type="submit">Create topic</button>
      </form>

      <div className="card-grid">
        {topics.map((topic) => (
          <article key={topic.id} className="entity-card">
            <h3>{topic.name}</h3>
            <div className="meta-line">
              <span className="meta-pill">{categoryLabel(topic.category)}</span>
              <span className="meta-pill">{topic.scope === "shared" ? "Team" : "Personal"}</span>
              <span className="meta-pill">{topic.window}</span>
            </div>
            <p className="entity-note">+ {(topic.includeTerms || []).slice(0, 4).join(", ") || "No include terms"}</p>
            {(topic.excludeTerms || []).length > 0 ? (
              <p className="entity-note">- {(topic.excludeTerms || []).slice(0, 4).join(", ")}</p>
            ) : null}
            <div className="summary-actions">
              <button onClick={() => void triggerBackfill(topic.id)}>Refresh now</button>
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
