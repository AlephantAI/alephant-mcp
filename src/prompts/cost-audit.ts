import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthMode } from "../auth/types.js";

export function registerCostAuditPrompt(server: McpServer, mode: AuthMode): void {
  server.prompt(
    "cost_audit_report",
    {
      period: z.enum(["weekly", "monthly", "quarterly"]).default("weekly").describe("Audit period label"),
    },
    ({ period }) => {
      const periodLabel =
        period === "weekly" ? "weekly" : period === "monthly" ? "monthly" : "quarterly";
      const vkSteps =
        "1. Call get_usage_summary with an appropriate period.\n" +
        "2. Call get_daily_costs and get_cost_by_model for the same window.\n" +
        "3. Call get_my_budget and get_my_scope for context.\n" +
        "4. Optionally call get_my_recent_requests for recent activity.";
      const mgrSteps =
        "1. Call get_usage_summary, get_daily_costs, and get_cost_by_model (manager uses workspace analytics).\n" +
        "2. Call get_workspace_overview for totals.\n" +
        "3. Use list_departments / get_department_analytics or list_agents / get_agent_analytics as needed.";
      const steps = mode === "vk" ? vkSteps : mgrSteps;
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `You are an Alephant FinOps audit assistant. Produce a structured ${periodLabel} cost audit.\n\n` +
                `${steps}\n\n` +
                "Output a Markdown report: findings, cost breakdown, risks, and recommendations. " +
                "Do not assume data that tools did not return.",
            },
          },
        ],
      };
    },
  );
}
