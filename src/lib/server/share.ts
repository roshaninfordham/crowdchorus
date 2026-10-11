import { headers } from "next/headers";
import QRCode from "qrcode";

/** Absolute base URL: PUBLIC_BASE_URL, else the request's own origin. */
export async function baseUrl(): Promise<string> {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#0c0b10", light: "#ffffff" } });
}
