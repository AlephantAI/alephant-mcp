import { describe, it, expect, vi, beforeEach } from "vitest";
import { ManagerClient } from "./manager-client.js";

function mockAxiosGet(client: ManagerClient, responseData: unknown) {
  vi.spyOn(client.http, "get").mockResolvedValue({ data: responseData });
}

describe("ManagerClient atomic methods", () => {
  let client: ManagerClient;

  beforeEach(() => {
    client = new ManagerClient("https://test.example.com", "pat-test", "ws-id-test");
  });

  describe("getLive24h", () => {
    it("calls /api/v1/analytics/live-24h with limit param", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getLive24h(3);
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/live-24h", {
        params: { limit: 3 },
      });
    });

    it("defaults limit to 5", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getLive24h();
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/live-24h", {
        params: { limit: 5 },
      });
    });
  });

  describe("getUsageTimeseries", () => {
    it("passes metric, granularity, and preset as params", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getUsageTimeseries("cost", "day", "30d");
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/usage/timeseries", {
        params: { metric: "cost", granularity: "day", preset: "30d" },
      });
    });
  });

  describe("getMemberAnalytics", () => {
    it("calls /api/v1/analytics/members/{id}/analytics with days", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getMemberAnalytics("uuid-123", "7d");
      expect(client.http.get).toHaveBeenCalledWith(
        "/api/v1/analytics/members/uuid-123/analytics",
        { params: { days: 7 } },
      );
    });
  });

  describe("getSparklines", () => {
    it("defaults metrics to 'all'", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getSparklines();
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/sparklines", {
        params: { metrics: "all" },
      });
    });

    it("passes custom metrics", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getSparklines("spend,requests");
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/sparklines", {
        params: { metrics: "spend,requests" },
      });
    });
  });
});

describe("ManagerClient composite helper methods", () => {
  let client: ManagerClient;

  beforeEach(() => {
    client = new ManagerClient("https://test.example.com", "pat-test", "ws-id-test");
  });

  describe("getAnalyticsCostsRange", () => {
    it("passes explicit dateFrom and dateTo", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getAnalyticsCostsRange("2026-03-01", "2026-03-30");
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/costs", {
        params: { dateFrom: "2026-03-01", dateTo: "2026-03-30" },
      });
    });
  });

  describe("getSaasUsageForEntity", () => {
    it("passes date range and agentId filter", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getSaasUsageForEntity("2026-03-01", "2026-03-30", { agentId: "agent-uuid" });
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/usage", {
        params: { dateFrom: "2026-03-01", dateTo: "2026-03-30", agentId: "agent-uuid" },
      });
    });

    it("passes date range and departmentId filter", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getSaasUsageForEntity("2026-03-01", "2026-03-30", { departmentId: "dept-uuid" });
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/usage", {
        params: { dateFrom: "2026-03-01", dateTo: "2026-03-30", departmentId: "dept-uuid" },
      });
    });

    it("passes date range and memberId filter", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getSaasUsageForEntity("2026-03-01", "2026-03-30", { memberId: "member-uuid" });
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/usage", {
        params: { dateFrom: "2026-03-01", dateTo: "2026-03-30", memberId: "member-uuid" },
      });
    });
  });
});
