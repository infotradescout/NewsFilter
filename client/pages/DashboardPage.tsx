import { useEffect, useMemo, useState } from "react";
import {
  AlertRule,
  api,
  CalendarEvent,
  DashboardLayout,
  DashboardTopicCard,
  DashboardWatchCard,
  DashboardWidgetLayout,
  DashboardWidgetSize,
  MarketQuote,
  PortfolioPosition,
} from "../api";
import { categoryLabel } from "../labels";

interface DashboardPageProps {
  onOpenTab?: (tab: "topics" | "feeds" | "watch") => void;
}

const SIZE_ORDER: DashboardWidgetSize[] = ["s", "m", "l"];
const DASHBOARD_TEMPLATES = [
  { key: "commodities", label: "Commodities Trader" },
  { key: "macro", label: "Macro Desk" },
  { key: "crypto", label: "Crypto Desk" },
] as const;

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

function toneLabel(tone?: "positive" | "negative" | "neutral"): string {
  if (tone === "positive") return "Bullish";
  if (tone === "negative") return "Bearish";
  return "Neutral";
}

function truncateText(text: string | undefined, maxLength = 90): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
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
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState<Array<{ id: string; name: string; reasons: string[]; updatedAt: string }>>([]);
  const [preferences, setPreferences] = useState<{ blockedDomains: string[]; trustOverrides: Record<string, number> }>({
    blockedDomains: [],
    trustOverrides: {},
  });
  const [blockedDomainInput, setBlockedDomainInput] = useState("");
  const [newPosition, setNewPosition] = useState({ symbol: "", quantity: 0, avgCost: "" });
  const [newAlert, setNewAlert] = useState({ name: "", symbol: "", minAbsChangePct: "" });
  const [layout, setLayout] = useState<DashboardLayout>({ widgets: [] });
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [newSymbol, setNewSymbol] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const topicMap = useMemo(() => new Map(topics.map((item) => [item.id, item])), [topics]);
  const watchMap = useMemo(() => new Map(watchTopics.map((item) => [item.id, item])), [watchTopics]);

  async function load(options?: { fresh?: boolean; quiet?: boolean }) {
    const fresh = options?.fresh ?? false;
    const quiet = options?.quiet ?? false;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [dataRes, layoutRes] = await Promise.all([api.getDashboardData(fresh), api.getDashboardLayout()]);
      setTopics(dataRes.topics);
      setWatchTopics(dataRes.watchTopics);
      setDefaultPriceSymbols(dataRes.defaultPriceSymbols);
      setPortfolio(dataRes.portfolio);
      setAlertRules(dataRes.alertRules);

      const defaults = defaultWidgets(dataRes.topics, dataRes.watchTopics, dataRes.defaultPriceSymbols);
      const incoming = layoutRes.layout.widgets ?? [];
      const validIncoming = incoming.filter((widget) => {
        if (widget.type === "topic") return dataRes.topics.some((item) => item.id === widget.refId);
        if (widget.type === "watch") return dataRes.watchTopics.some((item) => item.id === widget.refId);
        return true;
      });

      setLayout({ widgets: validIncoming.length > 0 ? validIncoming : defaults });
      const [calendarRes, alertsRes, prefRes] = await Promise.all([
        api.listCalendarEvents(),
        api.listTriggeredAlerts(),
        api.getPreferences(),
      ]);
      setCalendarEvents(calendarRes.events);
      setTriggeredAlerts(alertsRes.items);
      setPreferences(prefRes.preferences);
      setBlockedDomainInput(prefRes.preferences.blockedDomains.join(", "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      if (!quiet) setLoading(false);
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

  async function refreshNow() {
    setRefreshing(true);
    setError(null);
    setMessage(null);
    try {
      const response = await api.refreshDashboard();
      setMessage(
        response.queuedTopics > 0
          ? `Refreshing ${response.queuedTopics} topics now...`
          : "No active topics found yet."
      );
      await new Promise((resolve) => setTimeout(resolve, 3500));
      await load({ fresh: true, quiet: true });
      setMessage("Dashboard updated.");
      setTimeout(() => setMessage(null), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh dashboard");
    } finally {
      setRefreshing(false);
    }
  }

  const priceSymbols = useMemo(() => {
    const fromWidgets = layout.widgets
      .filter((widget) => !widget.hidden && widget.type === "price")
      .map((widget) => widget.symbol || widget.refId);
    const fromPortfolio = portfolio.filter((p) => p.active).map((p) => p.symbol);
    return [...new Set([...fromWidgets, ...fromPortfolio])];
  }, [layout.widgets, portfolio]);

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
  const activeQuoteValues = Object.values(quotes).filter((quote) => quote.changePct !== null && quote.changePct !== undefined);
  const gainers = activeQuoteValues.filter((quote) => (quote.changePct ?? 0) > 0).length;
  const losers = activeQuoteValues.filter((quote) => (quote.changePct ?? 0) < 0).length;
  const avgMove =
    activeQuoteValues.length > 0
      ? activeQuoteValues.reduce((sum, quote) => sum + (quote.changePct ?? 0), 0) / activeQuoteValues.length
      : null;
  const signals = visibleWidgets
    .filter((widget) => widget.type === "topic" || widget.type === "watch")
    .map((widget) => {
      if (widget.type === "topic") return topicMap.get(widget.refId)?.last?.tone;
      return watchMap.get(widget.refId)?.last?.tone;
    });
  const bullishSignals = signals.filter((tone) => tone === "positive").length;
  const bearishSignals = signals.filter((tone) => tone === "negative").length;

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

  async function addPortfolioPosition() {
    if (!newPosition.symbol.trim()) return;
    await api.createPortfolioPosition({
      symbol: newPosition.symbol.trim().toUpperCase(),
      quantity: Number(newPosition.quantity || 0),
      avgCost: newPosition.avgCost ? Number(newPosition.avgCost) : null,
    });
    setNewPosition({ symbol: "", quantity: 0, avgCost: "" });
    await load();
  }

  async function removePortfolioPosition(id: string) {
    await api.deletePortfolioPosition(id);
    await load();
  }

  async function createAlertRule() {
    if (!newAlert.name.trim()) return;
    await api.createAlertRule({
      name: newAlert.name.trim(),
      symbol: newAlert.symbol.trim() ? newAlert.symbol.trim().toUpperCase() : null,
      minAbsChangePct: newAlert.minAbsChangePct ? Number(newAlert.minAbsChangePct) : null,
    });
    setNewAlert({ name: "", symbol: "", minAbsChangePct: "" });
    await load();
  }

  async function removeAlertRule(id: string) {
    await api.deleteAlertRule(id);
    await load();
  }

  async function savePreferences() {
    const blockedDomains = blockedDomainInput
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    await api.savePreferences({ blockedDomains, trustOverrides: preferences.trustOverrides });
    await load();
  }

  function applyTemplate(template: (typeof DASHBOARD_TEMPLATES)[number]["key"]) {
    const topicCandidates = topics.filter((t) => {
      if (template === "commodities") return t.category === "commodities";
      if (template === "macro") return t.category === "macro";
      if (template === "crypto") return t.category === "crypto";
      return true;
    });
    const nextWidgets = [
      ...defaultPriceSymbols.slice(0, 4).map((symbol) => ({
        id: widgetKey("price", symbol),
        type: "price" as const,
        refId: symbol,
        symbol,
        label: symbol,
        size: "s" as const,
      })),
      ...topicCandidates.slice(0, 8).map((item) => ({
        id: widgetKey("topic", item.id),
        type: "topic" as const,
        refId: item.id,
        size: "m" as const,
      })),
    ];
    setLayout({ widgets: nextWidgets });
  }

  if (loading) {
    return <section className="page-stack"><p>Loading dashboard...</p></section>;
  }

  return (
    <section className="page-stack">
      <header className="page-header-row">
        <div>
          <h2>Dashboard</h2>
          <p>Fast market signals. Minimal text. Decision-ready cards.</p>
        </div>
        <div className="summary-actions">
          <button className="secondary" onClick={() => setToolsOpen((prev) => !prev)}>
            {toolsOpen ? "Hide tools" : "Show tools"}
          </button>
          <button className={editMode ? "" : "secondary"} onClick={() => setEditMode((prev) => !prev)}>
            {editMode ? "Done" : "Edit layout"}
          </button>
          <button onClick={() => void saveLayout(layout)} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button className="secondary" onClick={() => void refreshNow()} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh now"}
          </button>
        </div>
      </header>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <section className="pulse-grid">
        <article className="pulse-card">
          <span className="tiny-meta">Gainers / Losers</span>
          <strong>
            <span className="price-up">{gainers}</span> / <span className="price-down">{losers}</span>
          </strong>
        </article>
        <article className="pulse-card">
          <span className="tiny-meta">Avg move</span>
          <strong className={avgMove === null ? "" : avgMove >= 0 ? "price-up" : "price-down"}>
            {avgMove === null ? "--" : `${avgMove >= 0 ? "+" : ""}${avgMove.toFixed(2)}%`}
          </strong>
        </article>
        <article className="pulse-card">
          <span className="tiny-meta">Signal mix</span>
          <strong>
            <span className="price-up">{bullishSignals} bullish</span> ·{" "}
            <span className="price-down">{bearishSignals} bearish</span>
          </strong>
        </article>
        <article className="pulse-card">
          <span className="tiny-meta">Cards</span>
          <strong>{visibleWidgets.length} active</strong>
        </article>
      </section>

      {toolsOpen || editMode ? (
        <>
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
                {DASHBOARD_TEMPLATES.map((template) => (
                  <button key={template.key} type="button" className="secondary" onClick={() => applyTemplate(template.key)}>
                    {template.label}
                  </button>
                ))}
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

          <section className="panel stack">
            <h3>Watchlist Heatmap</h3>
            <div className="starter-chip-row">
              {portfolio.map((position) => {
                const quote = quotes[position.symbol];
                const pct = quote?.changePct ?? null;
                const cls = pct === null ? "price-flat" : pct > 0 ? "price-up" : pct < 0 ? "price-down" : "price-flat";
                return (
                  <span key={position.id} className={`starter-chip ${cls}`}>
                    {position.symbol} {pct === null ? "--" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
                  </span>
                );
              })}
              {portfolio.length === 0 ? <span className="tiny-meta">No positions added yet.</span> : null}
            </div>
          </section>

          <section className="dashboard-add-grid">
            <article className="panel stack">
              <h3>Portfolio</h3>
              <label>
                Symbol
                <input
                  value={newPosition.symbol}
                  onChange={(event) => setNewPosition((prev) => ({ ...prev, symbol: event.target.value }))}
                  placeholder="CL=F, XOM, GLD"
                />
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  value={newPosition.quantity}
                  onChange={(event) => setNewPosition((prev) => ({ ...prev, quantity: Number(event.target.value || 0) }))}
                />
              </label>
              <label>
                Avg cost (optional)
                <input
                  type="number"
                  value={newPosition.avgCost}
                  onChange={(event) => setNewPosition((prev) => ({ ...prev, avgCost: event.target.value }))}
                />
              </label>
              <button type="button" onClick={() => void addPortfolioPosition()}>
                Add position
              </button>
              {portfolio.slice(0, 8).map((position) => (
                <div key={position.id} className="summary-actions">
                  <span className="tiny-meta">
                    {position.symbol} · qty {position.quantity}
                  </span>
                  <button className="secondary" type="button" onClick={() => void removePortfolioPosition(position.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </article>

            <article className="panel stack">
              <h3>Alerts</h3>
              <label>
                Name
                <input
                  value={newAlert.name}
                  onChange={(event) => setNewAlert((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Oil move alert"
                />
              </label>
              <label>
                Symbol (optional)
                <input
                  value={newAlert.symbol}
                  onChange={(event) => setNewAlert((prev) => ({ ...prev, symbol: event.target.value }))}
                  placeholder="CL=F"
                />
              </label>
              <label>
                Min % move (optional)
                <input
                  type="number"
                  value={newAlert.minAbsChangePct}
                  onChange={(event) => setNewAlert((prev) => ({ ...prev, minAbsChangePct: event.target.value }))}
                  placeholder="1.5"
                />
              </label>
              <button type="button" onClick={() => void createAlertRule()}>
                Create alert
              </button>
              {triggeredAlerts.slice(0, 5).map((item) => (
                <div key={item.id} className="stack">
                  <strong>{item.name}</strong>
                  {item.reasons.map((reason) => (
                    <span key={reason} className="tiny-meta">
                      {reason}
                    </span>
                  ))}
                </div>
              ))}
              {alertRules.slice(0, 6).map((rule) => (
                <div key={rule.id} className="summary-actions">
                  <span className="tiny-meta">{rule.name}</span>
                  <button className="secondary" type="button" onClick={() => void removeAlertRule(rule.id)}>
                    Delete
                  </button>
                </div>
              ))}
            </article>

            <article className="panel stack">
              <h3>Calendar</h3>
              {calendarEvents.slice(0, 6).map((event) => (
                <div key={event.id} className="stack">
                  <strong>{event.title}</strong>
                  <span className="tiny-meta">{new Date(event.when).toLocaleString()}</span>
                  <span className="tiny-meta">{event.note}</span>
                </div>
              ))}
              <label>
                Blocked domains (comma separated)
                <input value={blockedDomainInput} onChange={(event) => setBlockedDomainInput(event.target.value)} />
              </label>
              <button type="button" onClick={() => void savePreferences()}>
                Save source controls
              </button>
            </article>
          </section>
        </>
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
                  <span className={`signal-chip tone-${item.last?.tone ?? "neutral"}`}>{toneLabel(item.last?.tone)}</span>
                </div>
                <p className="dash-headline">{truncateText(item.last?.headline, 86) || "No summary yet"}</p>
                {expandedNow ? (
                  <div className="stack">
                    <p className="tiny-meta">{truncateText(item.last?.bullet, 130) || "Run refresh for latest signal."}</p>
                    {item.last?.why ? (
                      <p className="tiny-meta">
                        Why: {item.last.why.impactClass} · Score{" "}
                        {item.last.why.score !== null ? item.last.why.score.toFixed(2) : "--"}
                        {item.last.why.trust !== null ? ` · Trust: ${item.last.why.trust.toFixed(2)}` : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
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
                  <span className={`signal-chip tone-${item.last?.tone ?? "neutral"}`}>{toneLabel(item.last?.tone)}</span>
                </div>
                <p className="dash-headline">{truncateText(item.last?.headline, 86) || "No summary yet"}</p>
                {expandedNow ? (
                  <div className="stack">
                    <p className="tiny-meta">{truncateText(item.last?.bullet || item.queryText, 130)}</p>
                    {item.last?.why ? (
                      <p className="tiny-meta">
                        Why: {item.last.why.impactClass} · Score{" "}
                        {item.last.why.score !== null ? item.last.why.score.toFixed(2) : "--"}
                        {item.last.why.trust !== null ? ` · Trust: ${item.last.why.trust.toFixed(2)}` : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
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
