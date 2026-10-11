import { expect, it } from "vitest";
import { scrubEvent } from "./monitoring";

it("scrubs bodies, identity headers, users and signed query strings", () => {
  const event = scrubEvent({
    user: { id: "x" },
    request: {
      url: "http://h/api/media/rooms/r/cover.png?exp=1&sig=abc",
      data: "audio bytes",
      cookies: { a: "b" },
      query_string: "exp=1&sig=abc",
      headers: { "x-cc-host": "secret", "user-agent": "UA" },
    },
    breadcrumbs: [{ message: "GET /x?sig=1", data: { url: "/x?sig=1", status_code: 200, body: "nick" } }],
  });
  expect(event).toEqual({
    request: { url: "http://h/api/media/rooms/r/cover.png", headers: { "user-agent": "UA" } },
    breadcrumbs: [{ message: "GET /x", data: { url: "/x", status_code: 200 } }],
  });
});
