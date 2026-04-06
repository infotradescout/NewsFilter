import { useEffect, useMemo, useState } from "react";
import type { Feed, SessionUser, Topic } from "../api";
import { api } from "../api";
import { FREE_FINANCE_FEED_PRESETS, STARTER_TOPIC_PRESETS } from "../../shared/starterPack";
import { categoryLabel } from "../labels";

interface StartPageProps {
  user: SessionUser;
}

function normalizeUrl(raw: string): string {
  try {
    return new URL(raw.trim()).toString().replace(/\/$/, "");
  } catch {
    return raw.trim().replace(/\/$/, "");
  }
}

export default function StartPage({ user }: StartPageProps) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [feedRes, topicRes] = await Promise.all([api.listFeeds(), api.listTopics()]);
      setFeeds(feedRes.feeds);
      setTopics(topicRes.topics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load setup status");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const installedPresetCount = useMemo(() => {
    const installed = new Set(feeds.map((feed) => normalizeUrl(feed.url)));
    return FREE_FINANCE_FEED_PRESETS.filter((preset) => installed.has(normalizeUrl(preset.url))).length;
  }, [feeds]);

  const starterTopicCount = useMemo(() => {
    const presetNames = new Set(STARTER_TOPIC_PRESETS.map((topic) => topic.name.toLowerCase()));
    return topics.filter((topic) => presetNames.has(topic.name.toLowerCase())).length;
  }, [topics]);

  async function installRecommendedSources() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let created = 0;
      let existing = 0;

      for (const preset of FREE_FINANCE_FEED_PRESETS) {
        const response = await api.createFeed({
          name: preset.name,
          url: preset.url,
          type: preset.type,
        });
        if (response.existing) existing += 1;
        else created += 1;
      }

      await load();
      setMessage(`Sources ready. Added ${created}, already had ${existing}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to install recommended sources");
    } finally {
      setBusy(false);
    }
  }

  async function createStarterTopics() {
    if (feeds.length === 0) {
      setError("Install sources first.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const existing = new Set(topics.map((topic) => topic.name.toLowerCase()));
      const activeFeedIds = feeds.filter((feed) => feed.active).map((feed) => feed.id);

      let created = 0;
      let skipped = 0;

      for (const preset of STARTER_TOPIC_PRESETS) {
        if (existing.has(preset.name.toLowerCase())) {
          skipped += 1;
          continue;
        }

        await api.createTopic({
          name: preset.name,
          description: preset.description,
          queryText: preset.queryText,
          category: preset.category,
          scope: user.role === "admin" ? "shared" : "personal",
          window: preset.window,
          rules: {
            includeTerms: preset.includeTerms,
            excludeTerms: preset.excludeTerms,
            exactPhrases: preset.exactPhrases,
          },
          feedIds: activeFeedIds,
        });
        created += 1;
      }

      await load();
      setMessage(`Topics ready. Added ${created}, already had ${skipped}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create starter topics");
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    if (topics.length === 0) {
      setError("Create at least one topic first.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await Promise.all(topics.map((topic) => api.backfillTopic(topic.id)));
      setMessage("Refresh started. Check Inbox in 1-2 minutes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start refresh");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-stack">
      <header className="page-header-row">
        <div>
          <h2>Start Here</h2>
          <p>Set up NewsFilter in under two minutes.</p>
        </div>
        <button onClick={() => void load()} disabled={busy}>
          Refresh status
        </button>
      </header>

      <section className="setup-grid">
        <article className="setup-step">
          <h3>Step 1: Install sources</h3>
          <p className="muted">Add trusted free market feeds.</p>
          <p className="entity-note">
            Status: {installedPresetCount}/{FREE_FINANCE_FEED_PRESETS.length} installed
          </p>
          <button type="button" onClick={() => void installRecommendedSources()} disabled={busy}>
            {busy ? "Working..." : "Install Sources"}
          </button>
        </article>

        <article className="setup-step">
          <h3>Step 2: Create topics</h3>
          <p className="muted">Generate beginner packs with one click.</p>
          <div className="starter-chip-row">
            {STARTER_TOPIC_PRESETS.slice(0, 4).map((topic) => (
              <span key={topic.key} className="starter-chip">
                {categoryLabel(topic.category)}
              </span>
            ))}
          </div>
          <p className="entity-note">
            Status: {starterTopicCount}/{STARTER_TOPIC_PRESETS.length} created
          </p>
          <button type="button" onClick={() => void createStarterTopics()} disabled={busy}>
            {busy ? "Working..." : "Create Topics"}
          </button>
        </article>

        <article className="setup-step">
          <h3>Step 3: Run first refresh</h3>
          <p className="muted">Pull fresh results right now.</p>
          <p className="entity-note">No need to wait for hourly sync.</p>
          <button type="button" onClick={() => void runNow()} disabled={busy}>
            {busy ? "Starting..." : "Run Refresh"}
          </button>
        </article>
      </section>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
