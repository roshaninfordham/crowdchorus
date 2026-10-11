import { rm } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { STORAGE_DIR } from "../../playwright.config";

export const db = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://postgres:crowdchorus@localhost:5434/crowdchorus",
  allowExitOnIdle: true, // shared by every spec in the worker; never ended explicitly
});

/** Remove a test room, its events (no FK) and its files. */
export async function cleanupRoom(roomId: string) {
  await db.query("DELETE FROM session_events WHERE room_id = $1", [roomId]);
  await db.query("DELETE FROM rooms WHERE id = $1", [roomId]);
  await rm(path.join(STORAGE_DIR, "vocals", roomId), { recursive: true, force: true });
  await rm(path.join(STORAGE_DIR, "rooms", roomId), { recursive: true, force: true });
}
