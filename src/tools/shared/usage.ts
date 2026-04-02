import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolDeps } from "../deps.js";
import { requireCockpit, requireManager } from "../deps.js";
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
        const cockpit = requireCockpit(deps);
        return safeCall(() => cockpit.usageSummary(p), "vk");
      }
      const manager = requireManager(deps);
      return safeCall(() => manager.getAnalyticsCosts(p), "manager");
    },
  );

  server.tool(
    "get_daily_costs",
    { period: periodSchema },
    async ({ period }) => {
      const p = period as SharedPeriod;
      if (deps.mode === "vk") {
        const cockpit = requireCockpit(deps);
        return safeCall(() => cockpit.dailyCosts(p), "vk");
      }
      const manager = requireManager(deps);
      return safeCall(() => manager.getAnalyticsUsage(p), "manager");
    },
  );

  server.tool(
    "get_cost_by_model",
    { period: periodSchema },
    async ({ period }) => {
      const p = period as SharedPeriod;
      if (deps.mode === "vk") {
        const cockpit = requireCockpit(deps);
        return safeCall(() => cockpit.costByModel(p), "vk");
      }
      const manager = requireManager(deps);
      return safeCall(() => manager.getAnalyticsModels(p), "manager");
    },
  );
}
