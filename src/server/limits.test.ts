import { afterAll, describe, expect, test } from "bun:test";
import { fetchLimitsSummary, LimitsUnavailable } from "./limits";

const summary = { generatedAt: 1, accounts: [{ id: "claude:a", windows: [] }], errors: [] };
let mode: "ok" | "500" | "garbage" | "slow" = "ok";
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    if (new URL(req.url).pathname !== "/api/summary") return new Response("nope", { status: 404 });
    if (mode === "500") return new Response("boom", { status: 500 });
    if (mode === "garbage") return new Response("<html>", { headers: { "content-type": "text/html" } });
    if (mode === "slow") await Bun.sleep(500);
    return Response.json(summary);
  },
});
const base = `http://127.0.0.1:${server.port}`;
afterAll(() => server.stop(true));

describe("fetchLimitsSummary", () => {
  test("returns limits' summary", async () => {
    mode = "ok";
    expect(await fetchLimitsSummary(base)).toEqual(summary);
  });

  test("fails soft on errors, junk, timeouts and a dead service", async () => {
    for (const m of ["500", "garbage"] as const) {
      mode = m;
      await expect(fetchLimitsSummary(base)).rejects.toBeInstanceOf(LimitsUnavailable);
    }
    mode = "slow";
    await expect(fetchLimitsSummary(base, 50)).rejects.toBeInstanceOf(LimitsUnavailable);
    await expect(fetchLimitsSummary("http://127.0.0.1:1")).rejects.toBeInstanceOf(LimitsUnavailable);
  });
});
