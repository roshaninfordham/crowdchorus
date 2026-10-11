import { initMonitoring } from "@/lib/monitoring";

export function register() {
  initMonitoring(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
}

export { onRequestError } from "@/lib/monitoring";
