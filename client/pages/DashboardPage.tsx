import { useEffect, useMemo, useState } from "react";
import {
  api,
  DashboardLayout,
  DashboardTopicCard,
  DashboardWatchCard,
  DashboardWidgetLayout,
  DashboardWidgetSize,
  MarketQuote,
} from "../api";
import { categoryLabel } from "../labels";

interface DashboardPageProps {
  onOpenTab?: (tab: "topics" | "feeds" | "watch") => void;
}

const SIZE_ORDER: DashboardWidgetSize[] = ["s", "m", "l"];

function cycleSize(size: DashboardWidgetSize): DashboardWidgetSize {
  const idx = SIZE_ORDER.indexOf(size);
  return SIZE_ORDER[(idx + 1) % SIZE_ORDER.length];
}

function widgetKey(type: "topic" | "watch" | "price", refId: string): string {
  return `${type}:${refId}`;
}

function toneClass(tone?: "positive" | "negative" | "neutral"): string {
  if (tone === "positive") return "glow-green";
  if (tone === "negative") return "glow-red";
  return "";
}

function defaultWidgets(
  topics: DashboardTopicCard[],
  watchTopics: DashboardWatchCard[],
  defaultPriceSymbols: string[]
): DashboardWidgetLayout[] {
  const topicWidgets = topics.slice(0, 8).map((item) => ({
    id: widgetKey("topic", item.id),
    type: "topic" as const,
    refId: item.id,
    size: "m" as const,
  }));
  const watchWidgets = watchTopics.slice(0, 3).map((item) => ({
    id: widgetKey("watch", item.id),
    type: "watch" as const,
    refId: item.id,
    size: "s" as const,
  }));
  const priceWidgets = defaultPriceSymbols.slice(0, 4).map((symbol) => ({
    id: widgetKey("price", symbol),
    type: "price" as const,
    refId: symbol,
    symbol,
    label: symbol,
    size: "s" as const,
  }));
  return [...priceWidgets, ...topicWidgets, ...watchWidgets];
}

export default function DashboardPage({ onOpenTab }: DashboardPageProps) {
  const [topics, setTopics] = useState<DashboardTopicCard[]>([]);
  const [watchTopics, setWatchTopics] = useState<DashboardWatchCard[]>([]);
  const [defaultPriceSymbols, setDefaultPriceSymbols] = useState<string[]>([]);
  const [layout, setLayout] = useState<DashboardLayout>({ widgets: [] });
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [newSymbol, setNewSymbol] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const topicMap = useMemo(() => new Map(topics.map((item) => [item.id, item])), [topics]);
  const watchMap = useMemo(() => new Map(watchTopics.map((item) => [item.id, item])), [watchTopics]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [dataRes, layoutRes] = await Promise.all([api.getDashboardData(), api.getDashboardLayout()]);
      setTopics(dataRes.topics);
      setWatchTopics(dataRes.watchTopics);
      setDefaultPriceSymbols(dataRes.defaultPriceSymbols);

      const defaults = defaultWidgets(dataRes.topics, dataRes.watchTopics, dataRes.defaultPriceSymbols);
      const incoming = layoutRes.layout.widgets ?? [];
      const validIncoming = incoming.filter((widget) => {
        if (widget.type === "topic") return dataRes.topics.some((item) => item.id === widget.refId);
        if (widget.type === "watch") return dataRes.watchTopics.some((item) => item.id === widget.refId);
        return true;
      });

      setLayout({ widgets: validIncoming.length > 0 ? validIncoming : defaults });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function saveLayout(next: DashboardLayout) {
    setSaving(true);
    setError(null);
    try {
      await api.saveDashboardLayout(next);
      setMessage("Dashboard saved.");
      setTimeout(() => setMessage(null), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save dashboard");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const priceSymbols = useMemo(() => {
    return layout.widgets
      .filter((widget) => !widget.hidden && widget.type === "price")
      .map((widget) => widget.symbol || widget.refId);
  }, [layout.widgets]);

  useEffect(() => {
    if (priceSymbols.length === 0) {
      setQuotes({});
      return;
    }

    let cancelled = false;
    async function fetchQuotes() {
      try {
        const response = await api.getMarketQuotes(priceSymbols);
        if (cancelled) return;
        const map: Record<string, MarketQuote> = {};
        for (const quote of response.quotes) {
          map[quote.symbol] = quote;
        }
        setQuotes(map);
      } catch {
        if (!cancelled) setQuotes({});
      }
    }

    void fetchQuotes();
    const timer = setInterval(fetchQuotes, 120000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [priceSymbols.join(",")]);

  const visibleWidgets = layout.widgets.filter((widget) => !widget.hidden);

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function updateWidget(id: string, updater: (widget: DashboardWidgetLayout) => DashboardWidgetLayout) {
    const next = {
      widgets: layout.widgets.map((widget) => (widget.id === id ? updater(widget) : widget)),
    };
    setLayout(next);
  }

  function removeWidget(id: string) {
    const next = {
      widgets: layout.widgets.map((widget) => (widget.id === id ? { ...widget, hidden: true } : widget)),
    };
    setLayout(next);
  }

  function addWidget(widget: DashboardWidgetLayout) {
    const existing = layout.widgets.find((item) => item.id === widget.id);
    const next = existing
      ? {
          widgets: layout.widgets.map((item) => (item.id === widget.id ? { ...item, hidden: false } : item)),
        }
      : {
          widgets: [{ ...widget, hidden: false }, ...layout.widgets],
        };
    setLayout(next);
  }

  function reorder(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const current = [...visibleWidgets];
    const from = current.findIndex((item) => item.id === draggingId);
    const to = current.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = current.splice(from, 1);
    current.splice(to, 0, moved);

    const visibleIds = new Set(current.map((item) => item.id));
    const hidden = layout.widgets.filter((item) => item.hidden || !visibleIds.has(item.id));
    setLayout({
      widgets: [...current, ...hidden],
    });
  }

  const missingTopicCards = topics.filter(
    (item) => !layout.widgets.some((widget) => widget.type === "topic" && widget.refId === item.id && !widget.hidden)
  );
  const missingWatchCards = watchTopics.filter(
    (item) => !layout.widgets.some((widget) => widget.type === "watch" && widget.refId === item.id && !widget.hidden)
  );

  function addPriceCard() {
    const symbol = newSymbol.trim().toUpperCase();
    if (!symbol) return;
    addWidget({
      id: widgetKey("price", symbol),
      type: "price",
      refId: symbol,
      symbol,
      label: symbol,
      size: "s",
    });
    setNewSymbol("");
  }

  if (loading) {
    return <section className="page-stack"><p>Loading dashboard...</p></section>;
  }

  return (
    <section className="page-stack">
      <header className="page-header-row">
        <div>
          <h2>Dashboard</h2>
          <p>Drag cards, resize them, and expand only what you need.</p>
        </div>
        <div className="summary-actions">
          <button className={editMode ? "" : "secondary"} onClick={() => setEditMode((prev) => !prev)}>
            {editMode ? "Done" : "Edit layout"}
          </button>
          <button onClick={() => void saveLayout(layout)} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button className="secondary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </header>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {editMode ? (
        <section className="panel stack">
          <h3>Add cards</h3>
          <div className="dashboard-add-grid">
            <div className="stack">
              <strong>Topics</strong>
              {missingTopicCards.slice(0, 12).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="secondary"
                  onClick={() =>
                    addWidget({
                      id: widgetKey("topic", item.id),
                      type: "topic",
                      refId: item.id,
                      size: "m",
                    })
                  }
                >
                  + {item.name}
                </button>
              ))}
              {missingTopicCards.length === 0 ? (
                <p className="tiny-meta">All followed topics are already on your dashboard.</p>
              ) : null}
            </div>
            <div className="stack">
              <strong>Always-on</strong>
              {missingWatchCards.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="secondary"
                  onClick={() =>
                    addWidget({
                      id: widgetKey("watch", item.id),
                      type: "watch",
                      refId: item.id,
                      size: "s",
                    })
                  }
                >
                  + {item.name}
                </button>
              ))}
              {missingWatchCards.length === 0 ? (
                <p className="tiny-meta">All followed always-on items are shown.</p>
              ) : null}
            </div>
            <div className="stack">
              <strong>Price card</strong>
              <label>
                Symbol
                <input
                  value={newSymbol}
                  onChange={(event) => setNewSymbol(event.target.value)}
                  placeholder="GC=F, CL=F, HG=F..."
                />
              </label>
              <button type="button" onClick={addPriceCard}>
                + Add price card
              </button>
              <p className="tiny-meta">Try: CL=F, NG=F, GC=F, SI=F, HG=F, ZC=F, ZW=F, ZS=F</p>
            </div>
          </div>
          <div className="summary-actions">
            <button className="secondary" onClick={() => onOpenTab?.("topics")}>
              Open Topics
            </button>
            <button className="secondary" onClick={() => onOpenTab?.("feeds")}>
              Open Sources
            </button>
            <button className="secondary" onClick={() => onOpenTab?.("watch")}>
              Open Always On
            </button>
          </div>
        </section>
      ) : null}

      <div className="dashboard-grid">
        {visibleWidgets.map((widget) => {
          const expandedNow = !!expanded[widget.id];

          if (widget.type === "topic") {
            const item = topicMap.get(widget.refId);
            if (!item) return null;
            const cardToneClass = toneClass(item.last?.tone);
            return (
              <article
                key={widget.id}
                className={`dashboard-card size-${widget.size} ${cardToneClass}`}
                draggable={editMode}
                onDragStart={() => setDraggingId(widget.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => reorder(widget.id)}
              >
                <header>
                  <h3>{item.name}</h3>
                  <div className="summary-actions">
                    {editMode ? (
                      <>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => updateWidget(widget.id, (w) => ({ ...w, size: cycleSize(w.size) }))}
                        >
                          {widget.size.toUpperCase()}
                        </button>
                        <button type="button" className="secondary" onClick={() => removeWidget(widget.id)}>
                          Hide
                        </button>
                      </>
                    ) : null}
                    <button type="button" className="secondary" onClick={() => toggleExpand(widget.id)}>
                      {expandedNow ? "Less" : "More"}
                    </button>
                  </div>
                </header>
                <div className="summary-meta">
                  <span>{categoryLabel(item.category)}</span>
                  <span>{item.window}</span>
                </div>
                <p className="dash-headline">{item.last?.headline ?? "No summary yet"}</p>
                {expandedNow ? <p className="tiny-meta">{item.last?.bullet || "Run refresh for latest signal."}</p> : null}
              </article>
            );
          }

          if (widget.type === "watch") {
            const item = watchMap.get(widget.refId);
            if (!item) return null;
            const cardToneClass = toneClass(item.last?.tone);
            return (
              <article
                key={widget.id}
                className={`dashboard-card size-${widget.size} ${cardToneClass}`}
                draggable={editMode}
                onDragStart={() => setDraggingId(widget.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => reorder(widget.id)}
              >
                <header>
                  <h3>{item.name}</h3>
                  <div className="summary-actions">
                    {editMode ? (
                      <>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => updateWidget(widget.id, (w) => ({ ...w, size: cycleSize(w.size) }))}
                        >
                          {widget.size.toUpperCase()}
                        </button>
                        <button type="button" className="secondary" onClick={() => removeWidget(widget.id)}>
                          Hide
                        </button>
                      </>
                    ) : null}
                    <button type="button" className="secondary" onClick={() => toggleExpand(widget.id)}>
                      {expandedNow ? "Less" : "More"}
                    </button>
                  </div>
                </header>
                <div className="summary-meta">
                  <span>{categoryLabel(item.category)}</span>
                  <span>Always on</span>
                </div>
                <p className="dash-headline">{item.last?.headline ?? "No summary yet"}</p>
                {expandedNow ? <p className="tiny-meta">{item.last?.bullet || item.queryText}</p> : null}
              </article>
            );
          }

          const symbol = widget.symbol || widget.refId;
          const quote = quotes[symbol];
          const changePct = quote?.changePct ?? null;
          const changeClass =
            changePct === null ? "" : changePct > 0 ? "price-up" : changePct < 0 ? "price-down" : "price-flat";
          const glowClass =
            changePct === null ? "" : changePct > 0 ? "glow-green" : changePct < 0 ? "glow-red" : "";

          return (
            <article
              key={widget.id}
              className={`dashboard-card size-${widget.size} ${glowClass}`}
              draggable={editMode}
              onDragStart={() => setDraggingId(widget.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => reorder(widget.id)}
            >
              <header>
                <h3>{widget.label || symbol}</h3>
                <div className="summary-actions">
                  {editMode ? (
                    <>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => updateWidget(widget.id, (w) => ({ ...w, size: cycleSize(w.size) }))}
                      >
                        {widget.size.toUpperCase()}
                      </button>
                      <button type="button" className="secondary" onClick={() => removeWidget(widget.id)}>
                        Hide
                      </button>
                    </>
                  ) : null}
                  <button type="button" className="secondary" onClick={() => toggleExpand(widget.id)}>
                    {expandedNow ? "Less" : "More"}
                  </button>
                </div>
              </header>
              <p className="dash-price">{quote?.price !== null && quote?.price !== undefined ? quote.price.toFixed(2) : "--"}</p>
              <p className={`tiny-meta ${changeClass}`}>
                {changePct !== null && changePct !== undefined ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : "No price"}
              </p>
              {expandedNow ? (
                <p className="tiny-meta">
                  {quote?.name || symbol} {quote?.asOf ? `· ${new Date(quote.asOf).toLocaleTimeString()}` : ""}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
