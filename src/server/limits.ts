export class LimitsUnavailable extends Error {}

export async function fetchLimitsSummary(baseUrl: string, timeoutMs = 5_000): Promise<unknown> {
  const url = new URL("/api/summary", baseUrl);
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new LimitsUnavailable(`limits unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new LimitsUnavailable(`limits ${res.status}`);
  const body = (await res.json().catch(() => null)) as { accounts?: unknown } | null;
  if (!body || !Array.isArray(body.accounts)) throw new LimitsUnavailable("limits returned an unexpected response");
  return body;
}
