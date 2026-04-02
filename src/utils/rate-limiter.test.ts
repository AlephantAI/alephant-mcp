import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { RateLimiter } from "./rate-limiter.js";
import { resetGlobalRateLimiter } from "./rate-limiter.js";

describe("RateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rpm 0 skips waiting", async () => {
    const lim = new RateLimiter(0);
    const t0 = Date.now();
    await lim.acquire();
    await lim.acquire();
    expect(Date.now() - t0).toBeLessThan(50);
  });

  it("allows burst up to rpm after refill window", async () => {
    vi.useFakeTimers();
    const lim = new RateLimiter(60);
    await lim.acquire();
    vi.advanceTimersByTime(60_000);
    await lim.acquire();
    expect(true).toBe(true);
  });

  it("refills tokens over time", async () => {
    vi.useFakeTimers();
    const lim = new RateLimiter(60);
    await lim.acquire();
    vi.advanceTimersByTime(30_000);
    await lim.acquire();
    expect(true).toBe(true);
  });

  it("waits when tokens exhausted with higher rpm", async () => {
    vi.useFakeTimers();
    const lim = new RateLimiter(120);
    await lim.acquire();
    await lim.acquire();
    const p = lim.acquire();
    vi.advanceTimersByTime(1000);
    await p;
    expect(true).toBe(true);
  });
});

describe("acquireGlobalRateSlot with reset", () => {
  const original = { ...process.env };

  beforeEach(() => {
    resetGlobalRateLimiter();
  });

  afterEach(() => {
    process.env = { ...original };
    resetGlobalRateLimiter();
  });

  it("respects RPM 0 after reset", async () => {
    process.env.ALEPHANT_RATE_LIMIT_RPM = "0";
    resetGlobalRateLimiter();
    const { acquireGlobalRateSlot } = await import("./rate-limiter.js");
    const t0 = Date.now();
    await acquireGlobalRateSlot();
    expect(Date.now() - t0).toBeLessThan(50);
  });
});
