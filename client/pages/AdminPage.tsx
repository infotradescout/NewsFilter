import { FormEvent, useEffect, useState } from "react";
import type { Role, SessionUser } from "../api";
import { api } from "../api";

export default function AdminPage() {
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [invites, setInvites] = useState<Array<{ id: string; email: string; role: Role; expiresAt: string; acceptedAt: string | null }>>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [usersRes, invitesRes] = await Promise.all([api.listUsers(), api.listInvites()]);
      setUsers(usersRes.users);
      setInvites(invitesRes.invites);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const response = await api.createInvite({ email, role });
      setInviteLink(response.inviteLink);
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite");
    }
  }

  return (
    <section className="page-stack">
      <header className="page-header-row">
        <div>
          <h2>Team</h2>
          <p>Invite people and manage who has access.</p>
        </div>
      </header>

      <form onSubmit={handleInvite} className="panel stack">
        <h3 className="section-title">Create invite</h3>
        <div className="form-grid-2">
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <button type="submit">Create invite</button>
        {inviteLink ? (
          <div className="entity-card">
            <p className="muted">Send this link to the user:</p>
            <p className="success">{inviteLink}</p>
          </div>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
      </form>

      <div className="panel">
        <h3 className="section-title">Users</h3>
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="panel">
        <h3 className="section-title">Invites</h3>
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Expires</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.id}>
                <td>{invite.email}</td>
                <td>{invite.role}</td>
                <td>{new Date(invite.expiresAt).toLocaleString()}</td>
                <td>{invite.acceptedAt ? "accepted" : "pending"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  );
}
