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

  const navItems = useMemo(
    () => [
      { to: "/dashboard", label: "Home" },
      { to: "/inbox", label: "Feed" },
      { to: "/topics", label: "Themes" },
      { to: "/feeds", label: "Sources" },
      { to: "/watch-topics", label: "Always On" },
    ],
    []
  );

  const sectionTitleByPath: Record<string, string> = {
    "/dashboard": "Home",
    "/inbox": "Live Feed",
    "/topics": "Themes",
    "/feeds": "Sources",
    "/watch-topics": "Always On",
    "/admin": "Team Access",
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
              <p>Live Intelligence</p>
            </div>
          </div>
          <button onClick={handleLogout} className="secondary">
            Logout
          </button>
        </div>
        <nav className="main-nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
          {user.role === "admin" ? <NavLink to="/admin">Team</NavLink> : null}
        </nav>
      </aside>
      <main className="content-area">
        <header className="topbar">
          <div className="stack">
            <h2>{sectionTitle}</h2>
            <span className="live-pill">Live</span>
          </div>
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
      <nav className="mobile-bottom-nav">
        {navItems.slice(0, 4).map((item) => (
          <NavLink key={item.to} to={item.to}>
            {item.label}
          </NavLink>
        ))}
      </nav>
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

