"use client";
import { useSyncExternalStore } from "react";

// Tokens live in localStorage per the identity contract:
// cc_host_<CODE> (sent as x-cc-host) and cc_session_<CODE> (sent as x-cc-session).
export const hostKey = (code: string) => `cc_host_${code}`;
export const sessionKey = (code: string) => `cc_session_${code}`;

const EVENT = "cc-storage";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

/** A localStorage value; null on the server and before hydration. */
export function useStored(key: string): string | null {
  return useSyncExternalStore(subscribe, () => read(key), () => null);
}

export function authHeaders(code: string): Record<string, string> {
  const h: Record<string, string> = {};
  const host = read(hostKey(code));
  const session = read(sessionKey(code));
  if (host) h["x-cc-host"] = host;
  if (session) h["x-cc-session"] = session;
  return h;
}

/** fetch → JSON, throwing the server's friendly `error` message on failure. */
export async function api<T>(url: string, init: RequestInit & { code?: string } = {}): Promise<T> {
  const { code, ...rest } = init;
  const headers = { ...(code ? authHeaders(code) : {}), ...(rest.headers as Record<string, string>) };
  const res = await fetch(url, { ...rest, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const jsonBody = (data: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(data),
});
