#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { useRealApi } from "./config.js";
import {
  getScope,
  getDashboard,
  getLiveMetrics,
  applyPolicy,
  formatScopeLabel,
} from "./client.js";

/**
 * Alephant MCP Server — user-centric: uses Virtual Key to resolve scope (workspace/department/Agent) and monitor.
 * No login, no workspace switching; users configure multiple Keys for separate monitoring.
 */

const server = new McpServer({
  name: "Alephant-FinOps-Manager",
  version: "1.0.3",
});

const credentialHint =
  "Set env ALEPHANT_API_BASE_URL and ALEPHANT_VIRTUAL_KEY, or pass them in Cursor MCP config.";

/**
 * Tool 1: Get budget status (scope = current Virtual Key; no workspaceId required)
 */
server.tool(
  "get_budget_status",
  {
    department: z.string().optional().describe("Department name (optional, for display or filter)"),
  },
  async ({ department: _department }) => {
    try {
      if (useRealApi()) {
        const [scope, dashboard, live] = await Promise.all([
          getScope(),
          getDashboard(),
          getLiveMetrics(),
        ]);
        if (!scope) {
          return {
            content: [{ type: "text" as const, text: `Failed to get scope. ${credentialHint}` }],
            isError: true,
          };
        }
        const label = formatScopeLabel(scope);
        const percent = live?.percent ?? dashboard?.costHistoryPercent?.slice(-1)[0] ?? 0;
        const remaining = live?.remainingPercent ?? (100 - percent).toFixed(2);
        const burnRate = live?.burnRate ?? dashboard?.burnRatePerHour ?? 0;
        const runtimeDays = dashboard?.runtimeEstDays ?? 0;
        const top = dashboard?.attributionItems?.[0];
        const topConsumer = top?.name ?? "—";
        const topCost = top?.costUsd ?? 0;

        const text = `[Budget] ${label}\nRemaining: ${remaining}% | Spent: ${percent}%\nBurn rate: ${burnRate}/h | Est. runtime: ${runtimeDays} days\nTop consumer: ${topConsumer} ($${topCost.toFixed(2)})`;
        return { content: [{ type: "text" as const, text }] };
      }

      const mockData = {
        remaining: 34.58,
        current_spend: 65.42,
        currency: "USD",
        top_consumer: "Axpha-Trader",
        status: "Normal",
      };
      return {
        content: [{
          type: "text" as const,
          text: `[Budget] Remaining: ${mockData.remaining} ${mockData.currency} (spent ${mockData.current_spend}%). Top consumer: ${mockData.top_consumer}. Status: ${mockData.status}.\n(Mock data when API is not configured.)`,
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to get budget: ${message}` }],
        isError: true,
      };
    }
  }
);

/**
 * Tool 2: List cost attribution for current scope (current Virtual Key; no workspaceId required)
 */
server.tool(
  "list_virtual_keys",
  {},
  async () => {
    try {
      if (useRealApi()) {
        const [scope, dashboard] = await Promise.all([getScope(), getDashboard()]);
        if (!scope) {
          return {
            content: [{ type: "text" as const, text: `Failed to get scope. ${credentialHint}` }],
            isError: true,
          };
        }
        const label = formatScopeLabel(scope);
        const items = dashboard?.attributionItems ?? [];
        const lines = items.length
          ? items.map((a) => `- ${a.name}${a.badge ? ` [${a.badge}]` : ""}: $${a.costUsd.toFixed(2)}`).join("\n")
          : "(No attribution data yet)";
        const text = `Current scope: ${label}\nCost attribution:\n${lines}`;
        return { content: [{ type: "text" as const, text }] };
      }

      const keys = [
        { agent: "Axpha-Trader", model: "gpt-4o", daily_limit: "10.00", usage: "High" },
        { agent: "Code-Reviewer", model: "claude-3-5-sonnet", daily_limit: "5.00", usage: "Low" },
      ];
      const text = `Active keys (Mock):\n${keys.map((k) => `- ${k.agent} [${k.model}]: load ${k.usage}, daily limit ${k.daily_limit}`).join("\n")}`;
      return { content: [{ type: "text" as const, text }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to list: ${message}` }],
        isError: true,
      };
    }
  }
);

/**
 * Tool 3: Apply cost policy (applies to current Virtual Key scope; no keyId required)
 */
server.tool(
  "apply_cost_policy",
  {
    policy: z.enum(["low-cost", "high-performance", "block"]).describe("Policy: low-cost=route to cheap model, high-performance=restore default, block=cut off traffic"),
  },
  async ({ policy }) => {
    try {
      const action = policy === "high-performance" ? "restore" : policy === "low-cost" ? "low-cost" : "block";

      if (useRealApi()) {
        const result = await applyPolicy(action);
        if (!result) {
          return {
            content: [{ type: "text" as const, text: `Policy request failed. ${credentialHint}` }],
            isError: true,
          };
        }
        if (!result.ok) {
          return {
            content: [{ type: "text" as const, text: `Policy failed: ${result.error ?? "Unknown error"}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: `Policy applied. Current key set to ${policy}. ${result.message ?? ""}` }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: `Policy applied (Mock). Current key set to ${policy}. Configure API for real enforcement.`,
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to apply policy: ${message}` }],
        isError: true,
      };
    }
  }
);

/**
 * Audit report prompt: uses current Virtual Key scope; no workspaceId required
 */
server.prompt(
  "cost_audit_report",
  {
    period: z.enum(["weekly", "monthly", "quarterly"]).default("weekly").describe("Audit period"),
  },
  ({ period }) => {
    const periodLabel = period === "weekly" ? "weekly" : period === "monthly" ? "monthly" : "quarterly";
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are an Alephant FinOps audit expert. Using the **current Virtual Key scope** (user-centric; no workspace ID needed), produce a detailed ${periodLabel} cost audit report.

Steps:
1. Call get_budget_status (no args) to get budget and trend for the current key.
2. Call list_virtual_keys (no args) to see cost attribution for the current scope.
3. Analyze the data; flag warnings if growth or anomalies are significant.
4. Output a Markdown report with: key findings, cost breakdown, risk assessment, and recommendations.`,
          },
        },
      ],
    };
  }
);

async function runServer() {
  if (process.argv.includes("--audit")) {
    console.log("--- Alephant CLI audit ---");
    if (useRealApi()) {
      const scope = await getScope();
      const label = scope ? formatScopeLabel(scope) : "(Could not get scope)";
      console.log("Scope:", label);
    } else {
      console.log("Status: Normal | Budget remaining: 34.58 USD | Suggestion: No change (Mock)");
    }
    process.exit(0);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Alephant MCP Server (v1.0.3) running. User-centric; scope and metrics via Virtual Key.");
}

runServer().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
