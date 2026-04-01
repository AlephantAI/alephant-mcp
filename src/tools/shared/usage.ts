import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolDeps } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";
import type { SharedPeriod } from "../../utils/analytics-period.js";

const periodSchema = z
  .enum(["24h", "7d", "30d", "billing_cycle"])
  .default("billing_cycle")
  .describe("Aggregation window");

export function registerSharedUsageTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "get_usage_summary",
    { period: periodSchema },
    async ({ period }) => {
      const p = period as SharedPeriod;
      if (deps.mode === "vk") {
        if (!deps.cockpit) throw new Error("Cockpit client not configured");
        return safeCall(() => deps.cockpit!.usageSummary(p), "vk");
      }
      if (!deps.manager) throw new Error("Manager client not configured");
      return safeCall(() => deps.manager!.getAnalyticsCosts(p), "manager");
    },
  );

  server.tool(
    "get_daily_costs",
    { period: periodSchema },
    async ({ period }) => {
      const p = period as SharedPeriod;
      if (deps.mode === "vk") {
        if (!deps.cockpit) throw new Error("Cockpit client not configured");
        return safeCall(() => deps.cockpit!.dailyCosts(p), "vk");
      }
      if (!deps.manager) throw new Error("Manager client not configured");
      return safeCall(() => deps.manager!.getAnalyticsUsage(p), "manager");
    },
  );

  server.tool(
    "get_cost_by_model",
    { period: periodSchema },
    async ({ period }) => {
      const p = period as SharedPeriod;
      if (deps.mode === "vk") {
        if (!deps.cockpit) throw new Error("Cockpit client not configured");
        return safeCall(() => deps.cockpit!.costByModel(p), "vk");
      }
      if (!deps.manager) throw new Error("Manager client not configured");
      return safeCall(() => deps.manager!.getAnalyticsModels(p), "manager");
    },
  );
}
