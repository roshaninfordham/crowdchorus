// The only module that knows the monitoring vendor (Sentry). Swap it here.
import * as Sentry from "@sentry/nextjs";

const stripQuery =<T,>(u: T): T => (typeof u === "string" ? (u.split("?")[0] as T) : u);

type Scrubbable = {
  user?: unknown;
  request?: {
    url?: string;
    data?: unknown;
    cookies?: unknown;
    query_string?: unknown;
    headers?: Record<string, string>;
  };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
  spans?: { data?: Record<string, unknown> }[];
};

/**
 * Shared beforeSend/beforeSendTransaction: no bodies (audio, nicknames, themes),
 * no cookies, no query strings (media signatures), no identity headers.
 */
export function scrubEvent<T extends Scrubbable>(event: T): T {
  delete event.user;
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    event.request.url = stripQuery(event.request.url);
    if (event.request.headers) {
      const ua = event.request.headers["user-agent"];
      event.request.headers = ua ? { "user-agent": ua } : {};
    }
  }
  event.breadcrumbs = event.breadcrumbs?.map((b) => ({
    ...b,
    message: stripQuery(b.message),
    data: b.data?.url ? { url: stripQuery(b.data.url), status_code: b.data.status_code } : undefined,
  }));
  for (const span of event.spans ?? []) {
    for (const k of ["url", "http.url", "http.query", "url.full", "url.query"]) {
      if (span.data && k in span.data) span.data[k] = stripQuery(span.data[k]);
    }
  }
  return event;
}

/** Start monitoring. Without a DSN nothing is sent and spans are no-ops. */
export function initMonitoring(dsn: string | undefined) {
  if (!dsn) return;
  const options = {
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 1.0,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
  };
  // scrubEvent is structurally typed; Sentry's event unions differ per runtime
  Sentry.init(options as Parameters<typeof Sentry.init>[0]);
}

export const span = <T,>(name: string, fn: () => Promise<T>): Promise<T> =>
  Sentry.startSpan({ name, op: "crowdchorus" }, fn);

export const captureError = (err: unknown) => Sentry.captureException(err);
export const onRequestError = Sentry.captureRequestError;
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
