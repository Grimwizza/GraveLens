/**
 * client.ts — shared fetch layer for external research sources.
 *
 * Every research API call goes through fetchSourceJson so that:
 *   1. Failures are logged server-side (visible in Vercel logs) instead of
 *      being swallowed by per-module `catch { return [] }` blocks.
 *   2. Transient errors (network, 429, 5xx) get one retry with jitter.
 *   3. Callers receive a typed outcome that distinguishes "the source is
 *      broken" from "the source answered with zero records" — the difference
 *      the UI needs to render honestly.
 */

export type SourceStatus = "ok" | "empty" | "failed" | "unavailable";

/** Standard wrapper returned by person-record source modules. */
export interface SourceResult<T> {
  status: SourceStatus;
  records: T[];
  /** Working deep link the user can open when status is failed/unavailable. */
  fallbackUrl?: string;
}

export function okResult<T>(records: T[]): SourceResult<T> {
  return { status: records.length > 0 ? "ok" : "empty", records };
}

export function failedResult<T>(fallbackUrl?: string): SourceResult<T> {
  return { status: "failed", records: [], fallbackUrl };
}

/**
 * For sources whose API no longer exists (e.g. FamilySearch records search,
 * which requires OAuth partner access). Callers short-circuit without a
 * network round-trip and hand the user a working deep link instead.
 */
export function unavailableResult<T>(fallbackUrl?: string): SourceResult<T> {
  return { status: "unavailable", records: [], fallbackUrl };
}

interface FetchJsonOptions {
  /** Telemetry label, e.g. "loc-newspapers" */
  source: string;
  timeoutMs?: number;
  /** Additional retry attempts after the first failure (default 1). */
  retries?: number;
  headers?: Record<string, string>;
}

export type FetchJsonOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; httpStatus?: number; error: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchSourceJson<T = unknown>(
  url: string,
  { source, timeoutMs = 9000, retries = 1, headers }: FetchJsonOptions
): Promise<FetchJsonOutcome<T>> {
  let lastError = "";
  let lastHttpStatus: number | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        return { ok: true, data: (await res.json()) as T };
      }
      lastHttpStatus = res.status;
      lastError = `HTTP ${res.status}`;
      // 4xx (except 429) will not succeed on retry
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < retries) await sleep(250 + Math.random() * 350);
  }

  console.error(
    `[research-source] ${source} failed: ${lastError} url=${url.slice(0, 200)}`
  );
  return { ok: false, httpStatus: lastHttpStatus, error: lastError };
}
