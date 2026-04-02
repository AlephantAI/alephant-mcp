import { describe, it, expect, afterEach } from "vitest";
import { getRateLimitRpm } from "./env.js";

describe("getRateLimitRpm", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("returns 60 when not set", () => {
    delete process.env.ALEPHANT_RATE_LIMIT_RPM;
    expect(getRateLimitRpm()).toBe(60);
  });

  it("returns parsed value when set", () => {
    process.env.ALEPHANT_RATE_LIMIT_RPM = "120";
    expect(getRateLimitRpm()).toBe(120);
  });

  it("returns 0 when set to 0", () => {
    process.env.ALEPHANT_RATE_LIMIT_RPM = "0";
    expect(getRateLimitRpm()).toBe(0);
  });

  it("returns 60 on negative value (fallback to default)", () => {
    process.env.ALEPHANT_RATE_LIMIT_RPM = "-1";
    expect(getRateLimitRpm()).toBe(60);
  });

  it("truncates non-integer value (parseInt behavior)", () => {
    process.env.ALEPHANT_RATE_LIMIT_RPM = "1.5";
    expect(getRateLimitRpm()).toBe(1);
  });

  it("returns 60 on non-numeric value", () => {
    process.env.ALEPHANT_RATE_LIMIT_RPM = "abc";
    expect(getRateLimitRpm()).toBe(60);
  });
});
