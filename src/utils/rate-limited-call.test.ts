import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.ALEPHANT_RATE_LIMIT_RPM = "0";
});

import { rateLimitedCall } from "./rate-limited-call.js";
import { resetGlobalRateLimiter } from "./rate-limiter.js";

describe("rateLimitedCall", () => {
  beforeEach(() => {
    process.env.ALEPHANT_RATE_LIMIT_RPM = "0";
    resetGlobalRateLimiter();
  });

  afterEach(() => {
    resetGlobalRateLimiter();
  });

  it("returns the resolved value from fn", async () => {
    const result = await rateLimitedCall(() => Promise.resolve({ ok: true }));
    expect(result).toEqual({ ok: true });
  });

  it("propagates errors from fn", async () => {
    await expect(
      rateLimitedCall(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
  });

  it("calls fn exactly once", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    await rateLimitedCall(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
