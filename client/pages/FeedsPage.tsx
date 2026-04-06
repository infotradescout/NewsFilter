import { FormEvent, useEffect, useState } from "react";
import type { Feed, FeedPreset } from "../api";
import { api } from "../api";
import { categoryLabel } from "../labels";

function normalizeUrl(raw: string): string {
  try {
    return new URL(raw.trim()).toString().replace(/\/$/, "");
  } catch {
    return raw.trim().replace(/\/$/, "");
  }
}

function feedCategoryLabel(category: FeedPreset["category"]): string {
  if (category === "general") return "General Markets";
  return categoryLabel(category);
}

export default function FeedsPage() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [presets, setPresets] = useState<FeedPreset[]>([]);
  const [selectedPresetKeys, setSelectedPresetKeys] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const [feedRes, presetRes] = await Promise.all([api.listFeeds(), api.listFeedPresets()]);
      const nextFeeds = feedRes.feeds;
      const nextPresets = presetRes.presets;
      setFeeds(nextFeeds);
      setPresets(nextPresets);

      const existingUrlSet = new Set(nextFeeds.map((feed) => normalizeUrl(feed.url)));
      setSelectedPresetKeys(
        nextPresets
          .filter((preset) => !existingUrlSet.has(normalizeUrl(preset.url)))
          .map((preset) => preset.key)
      );
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
    setSuccess(null);

    try {
      await api.createFeed({ name, url, type: "custom_rss" });
      setName("");
      setUrl("");
      setSuccess("Feed added.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create feed");
    }
  }

  function togglePreset(key: string, checked: boolean) {
    setSelectedPresetKeys((prev) => {
      if (checked) return [...prev, key];
      return prev.filter((item) => item !== key);
    });
  }

  async function installSelectedPresets() {
    if (selectedPresetKeys.length === 0) {
      setError("Select at least one source to install.");
      return;
    }

    setInstalling(true);
    setError(null);
    setSuccess(null);

    try {
      const selected = presets.filter((preset) => selectedPresetKeys.includes(preset.key));
      let createdCount = 0;
      let existingCount = 0;

      for (const preset of selected) {
        const response = await api.createFeed({
          name: preset.name,
          url: preset.url,
          type: preset.type,
        });
        if (response.existing) {
          existingCount += 1;
        } else {
          createdCount += 1;
        }
      }

      setSuccess(`Installed ${createdCount} new sources. ${existingCount} already existed.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to install recommended sources");
    } finally {
      setInstalling(false);
    }
  }

  const existingUrlSet = new Set(feeds.map((feed) => normalizeUrl(feed.url)));

  return (
    <section className="page-stack">
      <header className="page-header-row">
        <div>
          <h2>Feeds</h2>
          <p>Choose free news sources here. No technical setup needed.</p>
        </div>
        <button onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </header>

      <section className="panel stack">
        <h3 className="section-title">Quick setup: best free finance sources</h3>
        <p className="muted">Tap once to add quality free sources. Fastest way to improve coverage.</p>
        <div className="stack">
          {presets.map((preset) => {
            const installed = existingUrlSet.has(normalizeUrl(preset.url));
            return (
              <label key={preset.key} className="checkbox-row preset-row entity-card">
                <input
                  type="checkbox"
                  checked={selectedPresetKeys.includes(preset.key)}
                  disabled={installed}
                  onChange={(event) => togglePreset(preset.key, event.target.checked)}
                />
                <span>
                  <strong>{preset.name}</strong> · {feedCategoryLabel(preset.category)}
                  <br />
                  <span className="muted">{preset.description}</span>
                  {installed ? (
                    <>
                      <br />
                      <em>Already installed</em>
                    </>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
        <div className="summary-actions">
          <button
            type="button"
            onClick={() =>
              setSelectedPresetKeys(
                presets
                  .filter((preset) => !existingUrlSet.has(normalizeUrl(preset.url)))
                  .map((preset) => preset.key)
              )
            }
          >
            Select all
          </button>
          <button type="button" onClick={() => void installSelectedPresets()} disabled={installing || loading}>
            {installing ? "Installing..." : "Install selected sources"}
          </button>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="panel stack">
        <h3 className="section-title">Add custom feed</h3>
        <div className="form-grid-2">
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            URL
            <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} required />
          </label>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="success">{success}</p> : null}
        <button type="submit">Add feed</button>
      </form>

      <div className="panel">
        <h3 className="section-title">Installed sources</h3>
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>URL</th>
              <th>Availability</th>
            </tr>
          </thead>
          <tbody>
            {feeds.map((feed) => (
              <tr key={feed.id}>
                <td>{feed.name}</td>
                <td>{feed.type}</td>
                <td>
                  <a href={feed.url} target="_blank" rel="noreferrer">
                    {feed.url}
                  </a>
                </td>
                <td>Always on</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  );
}
