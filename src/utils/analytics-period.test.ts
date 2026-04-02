import { describe, it, expect } from "vitest";
import { periodToDateRange, agentPeriodToDays } from "./analytics-period.js";

describe("periodToDateRange", () => {
  it("returns empty object for billing_cycle", () => {
    expect(periodToDateRange("billing_cycle")).toEqual({});
  });

  it("returns 1 day range for 24h", () => {
    const range = periodToDateRange("24h");
    expect(range.dateFrom).toBeDefined();
    expect(range.dateTo).toBeDefined();
    const from = new Date(range.dateFrom!);
    const to = new Date(range.dateTo!);
    const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(0);
  });

  it("returns 7 day range for 7d", () => {
    const range = periodToDateRange("7d");
    const from = new Date(range.dateFrom!);
    const to = new Date(range.dateTo!);
    const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(6);
  });

  it("returns 30 day range for 30d", () => {
    const range = periodToDateRange("30d");
    const from = new Date(range.dateFrom!);
    const to = new Date(range.dateTo!);
    const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(29);
  });
});

describe("agentPeriodToDays", () => {
  it("returns 1 for 24h", () => {
    expect(agentPeriodToDays("24h")).toBe(1);
  });

  it("returns 7 for 7d", () => {
    expect(agentPeriodToDays("7d")).toBe(7);
  });

  it("returns 30 for 30d", () => {
    expect(agentPeriodToDays("30d")).toBe(30);
  });
});
