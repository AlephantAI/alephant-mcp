import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerCostDeepDivePrompt(server: McpServer): void {
  server.prompt(
    "cost_deep_dive",
    {
      target: z.enum(["workspace", "department", "agent"]).default("workspace")
        .describe("Starting scope for the deep dive"),
      target_id: z.string().uuid().optional()
        .describe("Required when target is department or agent"),
    },
    ({ target, target_id }) => {
      const targetContext = target === "workspace"
        ? "Analyze the entire workspace."
        : `Focus on ${target} with ID: ${target_id ?? "(not provided — ask user for ID)"}.`;

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `You are an Alephant FinOps deep-dive analyst (manager/PAT mode).\n\n` +
                `${targetContext}\n\n` +
                "Follow this workflow:\n" +
                "1. Call diagnose_cost_anomaly(period='30d') to discover anomaly dimensions.\n" +
                "2. Call drill_down_spend with the most anomalous dimension to identify specific entities.\n" +
                "3. Call compare_entity_periods for the top 3 spenders to validate with period comparison.\n" +
                "4. Call get_cost_by_model to check model-level cost anomalies.\n" +
                "5. If idle resources are suspected, call find_idle_resources for cleanup opportunities.\n" +
                "6. Synthesize a full report.\n\n" +
                "Output a Markdown deep-dive report: Executive Summary, Root Cause Analysis " +
                "(with data evidence), Impact Quantification ($), Prioritized Recommendations " +
                "(with expected savings). Never fabricate numbers not returned by tools.",
            },
          },
        ],
      };
    },
  );
}
