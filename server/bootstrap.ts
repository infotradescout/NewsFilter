import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { users } from "../shared/schema";
import { db, pool } from "./db";
import { env } from "./env";
import { newId } from "./utils/id";

export async function ensureSessionTable(): Promise<void> {
  await pool.query(`
    create table if not exists sessions (
      sid text primary key,
      sess json not null,
      expire timestamptz not null
    );
    create index if not exists idx_sessions_expire on sessions (expire);
  `);
}

export async function ensureSeedAdmin(): Promise<void> {
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    return;
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, env.SEED_ADMIN_EMAIL) });
  if (existing) {
    return;
  }

  const passwordHash = await hash(env.SEED_ADMIN_PASSWORD, 12);
  await db.insert(users).values({
    id: newId(),
    email: env.SEED_ADMIN_EMAIL,
    passwordHash,
    role: "admin",
  });
}

export async function runStartupBootstrap(): Promise<void> {
  await ensureSessionTable();
  await ensureSeedAdmin();
}