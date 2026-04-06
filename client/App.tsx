import { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, SessionUser } from "./api";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import AdminPage from "./pages/AdminPage";
import FeedsPage from "./pages/FeedsPage";
import InboxPage from "./pages/InboxPage";
import LoginPage from "./pages/LoginPage";
import StartPage from "./pages/StartPage";
import TopicsPage from "./pages/TopicsPage";
import WatchTopicsPage from "./pages/WatchTopicsPage";

function Shell({ user, onLogout }: { user: SessionUser; onLogout: () => Promise<void> }) {
  const navigate = useNavigate();

  async function handleLogout() {
    await onLogout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="side-nav-top">
          <div>
            <h1>NewsFilter</h1>
            <p>{user.email}</p>
          </div>
          <button onClick={handleLogout} className="secondary">
            Logout
          </button>
        </div>
        <nav className="main-nav">
          <NavLink to="/start">Start</NavLink>
          <NavLink to="/inbox">Updates</NavLink>
          <NavLink to="/topics">Topics</NavLink>
          <NavLink to="/feeds">Sources</NavLink>
          <NavLink to="/watch-topics">Always On</NavLink>
          {user.role === "admin" ? <NavLink to="/admin">Team</NavLink> : null}
        </nav>
      </aside>
      <main className="content-area">
        <Routes>
          <Route path="/start" element={<StartPage user={user} />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/topics" element={<TopicsPage isAdmin={user.role === "admin"} />} />
          <Route path="/feeds" element={<FeedsPage />} />
          <Route path="/watch-topics" element={<WatchTopicsPage isAdmin={user.role === "admin"} />} />
          {user.role === "admin" ? <Route path="/admin" element={<AdminPage />} /> : null}
          <Route path="*" element={<Navigate to="/start" replace />} />
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
    return <main className="centered-page">Loading NewsFilter...</main>;
  }

  return (
    <Routes>
      <Route path="/accept-invite" element={<AcceptInvitePage onAccepted={refreshSession} />} />
      <Route
        path="/login"
        element={user ? <Navigate to="/start" replace /> : <LoginPage onLoggedIn={refreshSession} />}
      />
      <Route
        path="/*"
        element={user ? <Shell user={user} onLogout={logout} /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
