import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

export function register() {
  // No DSN: Sentry stays disabled and every span call is a no-op.
  Sentry.init(sentryOptions(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN));
}

export const onRequestError = Sentry.captureRequestError;
