import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/** Manager-only prompt (§5.5). */
export function registerCostOptimizationPrompt(server: McpServer): void {
  server.prompt(
    "cost_optimization",
    {
      focus: z
        .enum(["models", "departments", "agents", "general"])
        .default("general")
        .describe("Optimization focus"),
    },
    ({ focus }) => {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                "You are an Alephant cost optimization advisor for a workspace (manager/PAT mode).\n\n" +
                `Focus: ${focus}.\n\n` +
                "Use tools: get_usage_summary, get_cost_by_model, list_departments, get_department_analytics, " +
                "list_agents, get_agent_analytics, get_subscription_info as needed.\n\n" +
                "Provide concrete, prioritized recommendations. Do not reference get_request_logs (not available in this MCP build).",
            },
          },
        ],
      };
    },
  );
}
