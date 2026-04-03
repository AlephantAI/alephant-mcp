import { acquireGlobalRateSlot } from "./rate-limiter.js";

export async function rateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
  await acquireGlobalRateSlot();
  return fn();
}
