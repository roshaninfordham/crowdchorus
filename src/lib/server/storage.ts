import path from "node:path";

// Runtime data (private vocals included): never traced into the build output.
export const STORAGE_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage");

/** Keys the browser may fetch via a signed URL. Vocals never qualify. */
const PUBLIC_PREFIXES = ["rooms/", "demo/"];

/**
 * Absolute path for a public storage key, or null if the key is private,
 * malformed or escapes STORAGE_DIR.
 */
export function publicMediaPath(key: string, root = STORAGE_DIR): string | null {
  if (!PUBLIC_PREFIXES.some((p) => key.startsWith(p))) return null;
  const parts = key.split("/");
  if (parts.some((p) => p === "" || p === "." || p === ".." || !/^[\w.-]+$/.test(p))) return null;
  const full = path.resolve(/*turbopackIgnore: true*/ root, ...parts);
  return full.startsWith(root + path.sep) ? full : null;
}

export function storagePath(key: string): string {
  return path.join(/*turbopackIgnore: true*/ STORAGE_DIR, key);
}

export function vocalKey(roomId: string, contributionId: string): string {
  return `vocals/${roomId}/${contributionId}.wav`;
}

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};
export function contentType(file: string): string {
  return TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}
