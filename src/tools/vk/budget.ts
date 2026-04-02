import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolDeps } from "../deps.js";
import { requireCockpit } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

export function registerVkBudgetTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "get_my_budget",
    {
      period: z
        .enum(["24h", "7d", "30d", "billing_cycle"])
        .default("billing_cycle")
        .describe("Budget window for cockpit/budget-status query param"),
    },
    async ({ period }) => {
      const cockpit = requireCockpit(deps);
      return safeCall(() => cockpit.budgetStatus(period), "vk");
    },
  );

  server.tool(
    "get_my_recent_requests",
    {
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    },
    async ({ limit, offset }) => {
      const cockpit = requireCockpit(deps);
      return safeCall(() => cockpit.recentRequests(limit, offset), "vk");
    },
  );
}
