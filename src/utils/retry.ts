/**
 * Exponential-backoff retry for LLM API calls. Cloud LLMs throw transient
 * errors (5xx, overloaded, rate-limit) constantly — without retry the whole
 * pipeline dies on a single network blip.
 *
 * Retries 3 times by default with 1s / 4s / 16s backoff, and only on errors
 * whose message matches a known-transient pattern. Anything else propagates
 * immediately (we don't want to mask real bugs in 10s of fruitless retries).
 */

export interface RetryOptions {
  retries?: number;
  /** override the transient-error matcher */
  isRetryable?: (err: unknown) => boolean;
  /** called before each retry (for logging) */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_RETRYABLE_PATTERNS = [
  /internal server error/i,
  /overloaded_error|overloaded/i,
  /rate[_-]?limit/i,
  /\b5\d\d\b/, // 5xx status
  /api_error/i,
  /fetch failed/i,
  /ECONN|ENETUNREACH|ETIMEDOUT|EPIPE|EAI_AGAIN/i,
];

export function isLikelyTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return DEFAULT_RETRYABLE_PATTERNS.some((re) => re.test(msg));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const retries = opts.retries ?? 3;
  const isRetryable = opts.isRetryable ?? isLikelyTransient;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isRetryable(err)) break;
      const delayMs = 1000 * Math.pow(4, attempt - 1); // 1s, 4s, 16s
      opts.onRetry?.(err, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
