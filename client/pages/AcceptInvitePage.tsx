import { FormEvent, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

interface AcceptInvitePageProps {
  onAccepted: () => Promise<void>;
}

export default function AcceptInvitePage({ onAccepted }: AcceptInvitePageProps) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.acceptInvite(token, password);
      await onAccepted();
      navigate("/inbox");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite acceptance failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="centered-page">
      <div className="auth-card">
        <h1>Accept Invite</h1>
        <p>Create your NewsFilter password to activate your account.</p>
        <form onSubmit={handleSubmit} className="stack">
          <label>
            Invite token
            <input type="text" value={token} disabled />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={loading || !token}>
            {loading ? "Activating..." : "Activate account"}
          </button>
        </form>
      </div>
    </main>
  );
}