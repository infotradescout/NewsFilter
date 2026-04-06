import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

interface LoginPageProps {
  onLoggedIn: () => Promise<void>;
}

export default function LoginPage({ onLoggedIn }: LoginPageProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.login(email, password);
      await onLoggedIn();
      navigate("/inbox");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="centered-page">
      <div className="auth-card">
        <h1>NewsFilter</h1>
        <p>Simple market news tracking for teams.</p>

        <form onSubmit={handleSubmit} className="stack">
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
