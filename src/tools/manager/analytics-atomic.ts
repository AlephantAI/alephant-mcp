import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolDeps } from "../deps.js";
import { requireManager } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";
import type { AgentDeptPeriod } from "../../utils/analytics-period.js";

export function registerManagerAtomicTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "get_live_24h",
    "Real-time rolling 24-hour dashboard: top models, top keys, and summary KPIs.",
    {
      limit: z.coerce.number().int().min(1).max(10).default(5)
        .describe("Top-N rows per panel section"),
    },
    async ({ limit }) => {
      const manager = requireManager(deps);
      return safeCall(() => manager.getLive24h(limit), "manager");
    },
  );

  server.tool(
    "get_usage_timeseries",
    "Time-series data for a single metric (cost/requests/tokens/latency/success_rate) with day or hour granularity. Note: hour granularity not supported for success_rate or latency.",
    {
      metric: z.enum(["cost", "requests", "tokens", "avg_cost_per_req", "success_rate", "latency"])
        .describe("Which metric to plot"),
      granularity: z.enum(["day", "hour"]).default("day")
        .describe("Bucket size"),
      period: z.enum(["7d", "30d", "3m", "6m", "12m"]).default("30d")
        .describe("Time window preset"),
    },
    async ({ metric, granularity, period }) => {
      const manager = requireManager(deps);
      return safeCall(
        () => manager.getUsageTimeseries(metric, granularity, period),
        "manager",
      );
    },
  );

  server.tool(
    "get_member_analytics",
    "Per-member (user) daily cost/request/token series over a lookback period.",
    {
      member_id: z.string().uuid().describe("Member/user UUID"),
      period: z.enum(["24h", "7d", "30d"]).default("30d")
        .describe("Lookback period"),
    },
    async ({ member_id, period }) => {
      const manager = requireManager(deps);
      return safeCall(
        () => manager.getMemberAnalytics(member_id, period as AgentDeptPeriod),
        "manager",
      );
    },
  );

  server.tool(
    "get_sparklines",
    "Lightweight 7-day multi-metric trend snapshot (spend, requests, tokens, success, latency).",
    {
      metrics: z.string().default("all")
        .describe("Comma-separated metric keys or 'all'"),
    },
    async ({ metrics }) => {
      const manager = requireManager(deps);
      return safeCall(() => manager.getSparklines(metrics), "manager");
    },
  );
}
