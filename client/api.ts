export type Role = "admin" | "member";
export type FinanceCategory = "macro" | "commodities" | "equities" | "crypto";
export type TopicWindow = "24h" | "7d" | "30d";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

export interface Feed {
  id: string;
  name: string;
  url: string;
  type: "custom_rss" | "google_query";
  active: boolean;
}

export interface FeedPreset {
  key: string;
  name: string;
  url: string;
  type: "custom_rss" | "google_query";
  category: "macro" | "commodities" | "equities" | "crypto" | "general";
  description: string;
}

export interface Topic {
  id: string;
  name: string;
  description: string | null;
  queryText: string | null;
  category: FinanceCategory;
  scope: "personal" | "shared";
  window: TopicWindow;
  includeTerms: string[];
  excludeTerms: string[];
  exactPhrases: string[];
  isPersistent: boolean;
  active: boolean;
  feedIds: string[];
}

export interface WatchTopic {
  id: string;
  name: string;
  category: FinanceCategory;
  queryText: string;
  linkedTopicId: string | null;
  isActive: boolean;
  followed: boolean;
}

export interface InboxItem {
  id: string;
  topicId: string;
  topicName: string;
  category: FinanceCategory;
  window: TopicWindow;
  headline: string;
  bullets: string[];
  sourceLink: string;
  sourceDomain: string;
  publishedAt: string;
  createdAt: string;
  read: boolean;
}

export interface JobRun {
  id: string;
  jobName: string;
  status: "running" | "success" | "failed";
  trigger: "scheduler" | "backfill" | "manual";
  startedAt: string;
  finishedAt: string | null;
  fetchedCount: number;
  dedupedCount: number;
  vettedCount: number;
  summarizedCount: number;
  skippedCount: number;
  tokenUsage: number;
  errorMessage: string | null;
}

export type DashboardWidgetType = "topic" | "watch" | "price";
export type DashboardWidgetSize = "s" | "m" | "l";

export interface DashboardWidgetLayout {
  id: string;
  type: DashboardWidgetType;
  refId: string;
  size: DashboardWidgetSize;
  hidden?: boolean;
  symbol?: string;
  label?: string;
}

export interface DashboardLayout {
  widgets: DashboardWidgetLayout[];
}

export interface DashboardTopicCard {
  id: string;
  name: string;
  category: FinanceCategory;
  window: TopicWindow;
  scope: "personal" | "shared";
  last: {
    headline: string;
    bullet: string;
    publishedAt: string;
    sourceLink: string;
    sourceDomain: string;
    tone: "positive" | "negative" | "neutral";
    why: {
      impactClass: string;
      score: number | null;
      trust: number | null;
    };
  } | null;
}

export interface DashboardWatchCard {
  id: string;
  name: string;
  category: FinanceCategory;
  queryText: string;
  last: {
    headline: string;
    bullet: string;
    publishedAt: string;
    sourceLink: string;
    sourceDomain: string;
    tone: "positive" | "negative" | "neutral";
    why: {
      impactClass: string;
      score: number | null;
      trust: number | null;
    };
  } | null;
}

export interface MarketQuote {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  asOf: string | null;
  currency: string;
}

export interface PortfolioPosition {
  id: string;
  userId: string;
  symbol: string;
  label: string | null;
  quantity: number;
  avgCost: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRule {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  symbol: string | null;
  minAbsChangePct: number | null;
  topicId: string | null;
  tone: "positive" | "negative" | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  category: FinanceCategory;
  when: string;
  importance: "high" | "medium";
  note: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: `Request failed: ${response.status}` }));
    throw new Error(errorBody.error || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<{ user: SessionUser | null }>("/api/auth/me"),
  login: (email: string, password: string) => request<{ user: SessionUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }),
  register: (email: string, password: string) =>
    request<{ user: SessionUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  acceptInvite: (token: string, password: string) =>
    request<{ user: SessionUser }>("/api/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
  listTopics: () => request<{ topics: Topic[] }>("/api/topics"),
  createTopic: (payload: unknown) => request<{ topic: Topic }>("/api/topics", { method: "POST", body: JSON.stringify(payload) }),
  backfillTopic: (topicId: string) =>
    request<{ ok: true; status: string }>(`/api/topics/${topicId}/backfill`, { method: "POST" }),
  deleteTopic: (topicId: string) => request<{ ok: true }>(`/api/topics/${topicId}`, { method: "DELETE" }),
  listFeeds: () => request<{ feeds: Feed[] }>("/api/feeds"),
  createFeed: (payload: unknown) =>
    request<{ feed: Feed; existing?: boolean }>("/api/feeds", { method: "POST", body: JSON.stringify(payload) }),
  listFeedPresets: () => request<{ presets: FeedPreset[] }>("/api/feeds/presets"),
  listWatchTopics: () => request<{ watchTopics: WatchTopic[] }>("/api/watch-topics"),
  createWatchTopic: (payload: unknown) =>
    request<{ watchTopic: WatchTopic }>("/api/watch-topics", { method: "POST", body: JSON.stringify(payload) }),
  updateWatchTopic: (id: string, payload: unknown) =>
    request<{ watchTopic?: WatchTopic; ok?: true; followed?: boolean }>(`/api/watch-topics/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteWatchTopic: (id: string) => request<{ ok: true }>(`/api/watch-topics/${id}`, { method: "DELETE" }),
  listInbox: (params?: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value) query.set(key, value);
      });
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<{ items: InboxItem[] }>(`/api/inbox${suffix}`);
  },
  refreshInbox: () => request<{ ok: true; queuedTopics: number }>("/api/inbox/refresh", { method: "POST" }),
  markRead: (itemId: string) => request<{ ok: true }>(`/api/inbox/${itemId}/read`, { method: "POST" }),
  listUsers: () => request<{ users: SessionUser[] }>("/api/admin/users"),
  listInvites: () => request<{ invites: Array<{ id: string; email: string; role: Role; expiresAt: string; acceptedAt: string | null }> }>(
    "/api/admin/invites"
  ),
  createInvite: (payload: { email: string; role: Role }) =>
    request<{ inviteLink: string; email: string; role: Role; expiresAt: string }>("/api/admin/invites", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listJobs: () => request<{ jobRuns: JobRun[] }>("/api/jobs/latest"),
  getDashboardData: (fresh = false) =>
    request<{
      topics: DashboardTopicCard[];
      watchTopics: DashboardWatchCard[];
      defaultPriceSymbols: string[];
      portfolio: PortfolioPosition[];
      alertRules: AlertRule[];
    }>(
      fresh ? "/api/dashboard/data?fresh=true" : "/api/dashboard/data"
    ),
  refreshDashboard: () => request<{ ok: true; queuedTopics: number }>("/api/dashboard/refresh", { method: "POST" }),
  getDashboardLayout: () => request<{ layout: DashboardLayout }>("/api/dashboard/layout"),
  saveDashboardLayout: (layout: DashboardLayout) =>
    request<{ ok: true }>("/api/dashboard/layout", {
      method: "PUT",
      body: JSON.stringify({ layout }),
    }),
  getMarketQuotes: (symbols: string[]) =>
    request<{ quotes: MarketQuote[] }>(`/api/market/prices?symbols=${encodeURIComponent(symbols.join(","))}`),
  listPortfolio: () => request<{ positions: PortfolioPosition[] }>("/api/portfolio"),
  createPortfolioPosition: (payload: unknown) =>
    request<{ position: PortfolioPosition }>("/api/portfolio", { method: "POST", body: JSON.stringify(payload) }),
  updatePortfolioPosition: (id: string, payload: unknown) =>
    request<{ position: PortfolioPosition }>(`/api/portfolio/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deletePortfolioPosition: (id: string) => request<{ ok: true }>(`/api/portfolio/${id}`, { method: "DELETE" }),
  listAlertRules: () => request<{ rules: AlertRule[] }>("/api/alerts"),
  createAlertRule: (payload: unknown) =>
    request<{ rule: AlertRule }>("/api/alerts", { method: "POST", body: JSON.stringify(payload) }),
  updateAlertRule: (id: string, payload: unknown) =>
    request<{ rule: AlertRule }>(`/api/alerts/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteAlertRule: (id: string) => request<{ ok: true }>(`/api/alerts/${id}`, { method: "DELETE" }),
  listTriggeredAlerts: () => request<{ items: Array<{ id: string; name: string; reasons: string[]; updatedAt: string }> }>(
    "/api/alerts/triggered"
  ),
  listCalendarEvents: () => request<{ events: CalendarEvent[]; note: string }>("/api/calendar/upcoming"),
  getPreferences: () =>
    request<{ preferences: { blockedDomains: string[]; trustOverrides: Record<string, number> } }>("/api/preferences"),
  savePreferences: (payload: { blockedDomains: string[]; trustOverrides: Record<string, number> }) =>
    request<{ ok: true }>("/api/preferences", { method: "PUT", body: JSON.stringify(payload) }),
};
