import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolDeps } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

const periodSchema = z
  .enum(["24h", "7d", "30d", "billing_cycle"])
  .default("billing_cycle")
  .describe("Aggregation window");

export function registerSharedUsageTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "get_usage_summary",
    { period: periodSchema },
    async ({ period }) => {
      if (deps.mode === "vk") {
        if (!deps.cockpit) throw new Error("Cockpit client not configured");
        return safeCall(() => deps.cockpit!.usageSummary(period), "vk");
      }
      if (!deps.manager) throw new Error("Manager client not configured");
      return safeCall(() => deps.manager!.getAnalyticsCosts(period), "manager");
    },
  );

  server.tool(
    "get_daily_costs",
    { period: periodSchema },
    async ({ period }) => {
      if (deps.mode === "vk") {
        if (!deps.cockpit) throw new Error("Cockpit client not configured");
        return safeCall(() => deps.cockpit!.dailyCosts(period), "vk");
      }
      if (!deps.manager) throw new Error("Manager client not configured");
      // Manager mode: /api/v1/analytics/usage returns daily cost entries (not /api/v1/analytics/costs)
      return safeCall(() => deps.manager!.getAnalyticsUsage(period), "manager");
    },
  );

  server.tool(
    "get_cost_by_model",
    { period: periodSchema },
    async ({ period }) => {
      if (deps.mode === "vk") {
        if (!deps.cockpit) throw new Error("Cockpit client not configured");
        return safeCall(() => deps.cockpit!.costByModel(period), "vk");
      }
      if (!deps.manager) throw new Error("Manager client not configured");
      return safeCall(() => deps.manager!.getAnalyticsModels(period), "manager");
    },
  );
}
