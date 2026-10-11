export class LimitsUnavailable extends Error {}

export async function fetchLimitsSummary(baseUrl: string, timeoutMs = 5_000): Promise<Record<string, unknown>> {
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
  return body as Record<string, unknown>;
}

/** Stores a Capy balance anchor in limits; returns limits' status and body (`{ account }` or `{ error }`). */
export async function postLimitsBalance(
  baseUrl: string,
  accountId: string,
  balanceUsd: number,
  timeoutMs = 10_000,
): Promise<{ status: number; body: unknown }> {
  const url = new URL(`/api/accounts/${encodeURIComponent(accountId)}/balance`, baseUrl);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "X-Limits-Action": "balance", "Content-Type": "application/json" },
      body: JSON.stringify({ balanceUsd }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new LimitsUnavailable(`limits unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { status: res.status, body: await res.json().catch(() => ({ error: `limits ${res.status}` })) };
}
