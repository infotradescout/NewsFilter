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
  createFeed: (payload: unknown) => request<{ feed: Feed }>("/api/feeds", { method: "POST", body: JSON.stringify(payload) }),
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
};