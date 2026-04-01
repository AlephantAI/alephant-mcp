import { getRateLimitRpm } from "../config/env.js";

/**
 * Token bucket: refills `rpm` tokens per wall-clock minute. `rpm <= 0` disables waiting.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefillMs: number;

  constructor(private readonly rpm: number) {
    this.lastRefillMs = Date.now();
    this.tokens = rpm <= 0 ? 1 : rpm;
  }

  private refill(): void {
    if (this.rpm <= 0) return;
    const now = Date.now();
    const elapsedMin = (now - this.lastRefillMs) / 60_000;
    if (elapsedMin <= 0) return;
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

/** Lazy init so tests can set ALEPHANT_RATE_LIMIT_RPM before first tool call. */
export async function acquireGlobalRateSlot(): Promise<void> {
  globalLimiter ??= new RateLimiter(getRateLimitRpm());
  return globalLimiter.acquire();
}
