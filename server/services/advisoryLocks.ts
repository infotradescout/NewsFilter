import { pool } from "../db";

function u32(value: number): number {
  return value >>> 0;
}

function hashToPair(key: string): [number, number] {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;

  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    h1 = u32(Math.imul(h1 ^ code, 0x01000193));
    h2 = u32(Math.imul(h2 + code, 0x27d4eb2d));
  }

  return [(h1 | 0) as number, (h2 | 0) as number];
}

export async function withAdvisoryLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T | null> {
  const [left, right] = hashToPair(lockKey);
  const lockResult = await pool.query("select pg_try_advisory_lock($1::int, $2::int) as locked", [
    left,
    right,
  ]);

  const locked = Boolean(lockResult.rows[0]?.locked);
  if (!locked) {
    return null;
  }

  try {
    return await fn();
  } finally {
    await pool.query("select pg_advisory_unlock($1::int, $2::int)", [left, right]).catch(() => undefined);
  }
}