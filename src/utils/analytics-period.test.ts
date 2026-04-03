import { describe, it, expect } from "vitest";
import { periodToDateRange, agentPeriodToDays, periodToTwoWindows } from "./analytics-period.js";

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

describe("periodToTwoWindows", () => {
  it("returns two 7-day windows for 7d", () => {
    const result = periodToTwoWindows("7d");
    const curFrom = new Date(result.current.dateFrom);
    const curTo = new Date(result.current.dateTo);
    const prevFrom = new Date(result.previous.dateFrom);
    const prevTo = new Date(result.previous.dateTo);
    const curDays = Math.round((curTo.getTime() - curFrom.getTime()) / 86400000);
    const prevDays = Math.round((prevTo.getTime() - prevFrom.getTime()) / 86400000);
    expect(curDays).toBe(6);
    expect(prevDays).toBe(6);
  });

  it("previous window ends the day before current window starts", () => {
    const result = periodToTwoWindows("30d");
    const curFrom = new Date(result.current.dateFrom);
    const prevTo = new Date(result.previous.dateTo);
    const gap = Math.round((curFrom.getTime() - prevTo.getTime()) / 86400000);
    expect(gap).toBe(1);
  });

  it("returns two 30-day windows for 30d", () => {
    const result = periodToTwoWindows("30d");
    const curFrom = new Date(result.current.dateFrom);
    const curTo = new Date(result.current.dateTo);
    const diffDays = Math.round((curTo.getTime() - curFrom.getTime()) / 86400000);
    expect(diffDays).toBe(29);
  });

  it("current window dateTo is today in UTC", () => {
    const result = periodToTwoWindows("7d");
    const today = new Date();
    const todayStr = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
      .toISOString().slice(0, 10);
    expect(result.current.dateTo).toBe(todayStr);
  });
});
