import { headers } from "next/headers";
import { networkInterfaces } from "node:os";
import QRCode from "qrcode";

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** First non-internal IPv4 address, so a phone on the same network can reach this machine. */
export function lanAddress(): string | null {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return null;
}

/**
 * Absolute base URL for share links and QR codes: PUBLIC_BASE_URL, else the
 * request's origin, with a loopback host swapped for the LAN address (a phone
 * scanning "localhost" would open itself).
 */
export async function baseUrl(): Promise<string> {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const h = await headers();
  let host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = LOOPBACK.test(host);
  const proto = h.get("x-forwarded-proto") ?? (local && !process.env.DEV_HTTPS ? "http" : "https");
  const lan = local ? lanAddress() : null;
  if (lan) host = lan + (host.match(/:\d+$/)?.[0] ?? "");
  return `${proto}://${host}`;
}

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#0c0b10", light: "#ffffff" } });
}
