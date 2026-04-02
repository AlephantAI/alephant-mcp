import { getRateLimitRpm } from "../config/env.js";

/**
 * Token bucket: refills `rpm` tokens per wall-clock minute. `rpm <= 0` disables waiting.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefillMs: number;

  constructor(private readonly rpm: number) {
    this.lastRefillMs = Date.now();
    this.tokens = rpm <= 0 ? 0 : rpm;
  }

  private refill(): void {
    if (this.rpm <= 0) return;
    const now = Date.now();
    const elapsedMs = now - this.lastRefillMs;
    if (elapsedMs < 1_000) return;
    const elapsedMin = elapsedMs / 60_000;
    const added = elapsedMin * this.rpm;
    this.tokens = Math.min(this.rpm, this.tokens + added);
    this.lastRefillMs = now;
  }

  async acquire(): Promise<void> {
    if (this.rpm <= 0) return;
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const deficit = 1 - this.tokens;
      const waitMs = Math.ceil((deficit * 60_000) / this.rpm);
      await new Promise((r) => setTimeout(r, Math.max(1, waitMs)));
    }
  }
}

let globalLimiter: RateLimiter | undefined;
let globalLimiterRpm: number | undefined;

/**
 * Lazy init + recreate on RPM change so env var updates take effect.
 * Tests should call resetGlobalRateLimiter() between cases.
 */
export async function acquireGlobalRateSlot(): Promise<void> {
  const rpm = getRateLimitRpm();
  if (!globalLimiter || rpm !== globalLimiterRpm) {
    globalLimiter = new RateLimiter(rpm);
    globalLimiterRpm = rpm;
  }
  return globalLimiter.acquire();
}

/** Reset the global limiter (for tests). */
export function resetGlobalRateLimiter(): void {
  globalLimiter = undefined;
  globalLimiterRpm = undefined;
}
