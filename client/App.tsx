import { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, SessionUser } from "./api";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import AdminPage from "./pages/AdminPage";
import DashboardPage from "./pages/DashboardPage";
import FeedsPage from "./pages/FeedsPage";
import InboxPage from "./pages/InboxPage";
import LoginPage from "./pages/LoginPage";
import TopicsPage from "./pages/TopicsPage";
import WatchTopicsPage from "./pages/WatchTopicsPage";

function Shell({ user, onLogout }: { user: SessionUser; onLogout: () => Promise<void> }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [viewMode, setViewMode] = useState<"modern" | "pro">(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("nf_view_mode") : null;
    return stored === "pro" ? "pro" : "modern";
  });
  const [densityMode, setDensityMode] = useState<"comfortable" | "compact">(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("nf_density_mode") : null;
    return stored === "compact" ? "compact" : "comfortable";
  });

  async function handleLogout() {
    await onLogout();
    navigate("/login");
  }

  function openTab(tab: "topics" | "feeds" | "watch") {
    if (tab === "topics") navigate("/topics");
    if (tab === "feeds") navigate("/feeds");
    if (tab === "watch") navigate("/watch-topics");
  }

  const sectionTitleByPath: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/inbox": "Updates",
    "/topics": "Topics",
    "/feeds": "Sources",
    "/watch-topics": "Always On",
    "/admin": "Team",
  };
  const sectionTitle = sectionTitleByPath[location.pathname] ?? "MarketFilter";

  useEffect(() => {
    window.localStorage.setItem("nf_view_mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    window.localStorage.setItem("nf_density_mode", densityMode);
  }, [densityMode]);

  return (
    <div className={`app-shell app-theme-${viewMode} density-${densityMode}`}>
      <aside className="side-nav">
        <div className="side-nav-top">
          <div className="brand">
            <span className="brand-mark" />
            <div>
              <h1>MarketFilter</h1>
              <p>Market Tracking</p>
            </div>
          </div>
          <button onClick={handleLogout} className="secondary">
            Logout
          </button>
        </div>
        <nav className="main-nav">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/inbox">Updates</NavLink>
          <NavLink to="/topics">Topics</NavLink>
          <NavLink to="/feeds">Sources</NavLink>
          <NavLink to="/watch-topics">Always On</NavLink>
          {user.role === "admin" ? <NavLink to="/admin">Team</NavLink> : null}
        </nav>
      </aside>
      <main className="content-area">
        <header className="topbar">
          <h2>{sectionTitle}</h2>
          <div className="topbar-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setViewMode((prev) => (prev === "modern" ? "pro" : "modern"))}
            >
              {viewMode === "modern" ? "Pro View" : "Modern View"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setDensityMode((prev) => (prev === "comfortable" ? "compact" : "comfortable"))}
            >
              {densityMode === "comfortable" ? "Compact" : "Comfort"}
            </button>
            <div className="user-chip">{user.email}</div>
          </div>
        </header>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage onOpenTab={openTab} />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/topics" element={<TopicsPage isAdmin={user.role === "admin"} />} />
          <Route path="/feeds" element={<FeedsPage />} />
          <Route path="/watch-topics" element={<WatchTopicsPage isAdmin={user.role === "admin"} />} />
          {user.role === "admin" ? <Route path="/admin" element={<AdminPage />} /> : null}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshSession() {
    setLoading(true);
    try {
      const response = await api.me();
      setUser(response.user);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await api.logout();
    setUser(null);
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  if (loading) {
    return <main className="centered-page">Loading MarketFilter...</main>;
  }

  return (
    <Routes>
      <Route path="/accept-invite" element={<AcceptInvitePage onAccepted={refreshSession} />} />
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <LoginPage onLoggedIn={refreshSession} />}
      />
      <Route
        path="/*"
        element={user ? <Shell user={user} onLogout={logout} /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}

