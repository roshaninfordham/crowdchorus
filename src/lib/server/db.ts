import { Pool, type PoolClient } from "pg";

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:crowdchorus@localhost:5434/crowdchorus";

// One pool per process; globalThis survives dev reloads and separate route bundles.
const g = globalThis as typeof globalThis & { __ccPool?: Pool };
export const pool = (g.__ccPool ??= new Pool({ connectionString: DATABASE_URL, max: 10 }));

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === "23505" && (!constraint || e.constraint === constraint);
}
