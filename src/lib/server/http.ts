import * as Sentry from "@sentry/nextjs";
import { ZodError } from "zod";
import { clientIp, rateLimit } from "./ratelimit";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
  ) {
    super(message);
  }
}

/**
 * Route wrapper: optional Sentry span, HttpError/ZodError → JSON, anything
 * else → captured 500 with no internals in the body.
 */
export function route<C>(span: string | null, handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return span
        ? await Sentry.startSpan({ name: span, op: "crowdchorus" }, () => handler(req, ctx))
        : await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return Response.json({ error: err.message, code: err.code }, { status: err.status });
      }
      if (err instanceof ZodError) {
        const issues = err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
        return Response.json({ error: "Please check the form and try again.", code: "invalid", issues }, { status: 400 });
      }
      Sentry.captureException(err);
      console.error(err);
      return Response.json({ error: "Something went wrong on our side.", code: "internal" }, { status: 500 });
    }
  };
}

export function limit(req: Request, name: string, capacity: number, perMinute: number) {
  if (!rateLimit(`${name}:${clientIp(req)}`, capacity, perMinute)) {
    throw new HttpError(429, "Too many requests. Please wait a moment and try again.", "rate_limited");
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Expected a JSON body.", "invalid");
  }
}
