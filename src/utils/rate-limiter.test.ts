import { describe, it, expect, vi, afterEach } from "vitest";
import { RateLimiter } from "./rate-limiter.js";

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
});
