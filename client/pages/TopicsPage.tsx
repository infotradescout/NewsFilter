import { FormEvent, useEffect, useState } from "react";
import type { Feed, FinanceCategory, Topic, TopicWindow } from "../api";
import { api } from "../api";
import { categoryHelp, categoryLabel } from "../labels";
import { STARTER_TOPIC_PRESETS } from "../../shared/starterPack";

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
  const [starterStatus, setStarterStatus] = useState<string | null>(null);
  const [creatingStarter, setCreatingStarter] = useState(false);
  const [starterScope, setStarterScope] = useState<"personal" | "shared">(isAdmin ? "shared" : "personal");

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

  useEffect(() => {
    if (!isAdmin) {
      setStarterScope("personal");
    }
  }, [isAdmin]);

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

  async function createStarterTopics() {
    if (feeds.length === 0) {
      setError("Add feeds first, then create starter topics.");
      return;
    }

    setCreatingStarter(true);
    setError(null);
    setStarterStatus(null);

    try {
      const existingNames = new Set(topics.map((topic) => topic.name.toLowerCase()));
      const feedIds = feeds.filter((feed) => feed.active).map((feed) => feed.id);

      let createdCount = 0;
      let skippedCount = 0;
      for (const preset of STARTER_TOPIC_PRESETS) {
        if (existingNames.has(preset.name.toLowerCase())) {
          skippedCount += 1;
          continue;
        }

        await api.createTopic({
          name: preset.name,
          description: preset.description,
          queryText: preset.queryText,
          category: preset.category,
          scope: starterScope,
          window: preset.window,
          rules: {
            includeTerms: preset.includeTerms,
            excludeTerms: preset.excludeTerms,
            exactPhrases: preset.exactPhrases,
          },
          feedIds,
        });
        createdCount += 1;
      }

      setStarterStatus(`Created ${createdCount} starter topics. ${skippedCount} already existed.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create starter topics");
    } finally {
      setCreatingStarter(false);
    }
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
        <h3>Create topic</h3>
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
        <p>{categoryHelp(category)}</p>
        <label>
          Who can see this topic?
          <select value={scope} onChange={(event) => setScope(event.target.value as "personal" | "shared")}> 
            <option value="personal">Only me</option>
            <option value="shared">My team</option>
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
          Include words (comma separated)
          <input value={includeTerms} onChange={(event) => setIncludeTerms(event.target.value)} />
        </label>
        <label>
          Exclude words (comma separated)
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

      <section className="panel stack">
        <h3>Quick setup: starter finance topics</h3>
        <p>Creates four beginner-friendly presets so you can start getting summaries right away.</p>
        {isAdmin ? (
          <label>
            Create as
            <select value={starterScope} onChange={(event) => setStarterScope(event.target.value as "personal" | "shared")}>
              <option value="shared">Shared</option>
              <option value="personal">Personal</option>
            </select>
          </label>
        ) : null}
        <div className="summary-actions">
          <button type="button" onClick={() => void createStarterTopics()} disabled={creatingStarter || loading}>
            {creatingStarter ? "Creating..." : "Create starter topics"}
          </button>
        </div>
        {starterStatus ? <p className="success">{starterStatus}</p> : null}
      </section>

      <div className="card-grid">
        {topics.map((topic) => (
          <article key={topic.id} className="panel stack">
            <h3>{topic.name}</h3>
            <p>
              {categoryLabel(topic.category)} · {topic.scope === "shared" ? "team" : "only me"} · {topic.window}
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
