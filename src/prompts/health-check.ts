import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerHealthCheckPrompt(server: McpServer): void {
  server.prompt(
    "workspace_health_check",
    {
      urgency: z.enum(["quick", "thorough"]).default("quick")
        .describe("quick = realtime snapshot only; thorough = full assessment"),
    },
    ({ urgency }) => {
      const quickSteps =
        "1. Call get_live_24h for real-time status.\n" +
        "2. Call get_sparklines for 7-day trend snapshot.\n" +
        "3. Output a brief health summary (normal / warning / critical + reason).";

      const thoroughSteps =
        "1. Call get_executive_dashboard for a global view.\n" +
        "2. Call diagnose_cost_anomaly(period='30d') for anomaly detection.\n" +
        "3. Call get_usage_timeseries(metric='success_rate') for success rate trend.\n" +
        "4. Call get_usage_timeseries(metric='latency') for latency trend.\n" +
        "5. Output a full Markdown health report.";

      const steps = urgency === "quick" ? quickSteps : thoroughSteps;

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                `You are an Alephant workspace health assessor (manager/PAT mode). Urgency: ${urgency}.\n\n` +
                `${steps}\n\n` +
                "Output a Markdown health report with sections: Status (🟢/🟡/🔴), Key Metrics, " +
                "Trends, Anomalies (if any), Recommended Actions. " +
                "Do not assume data that tools did not return.",
            },
          },
        ],
      };
    },
  );
}
