import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ToolDeps } from "../deps.js";
import { requireManager } from "../deps.js";
import { rateLimitedCall } from "../../utils/rate-limited-call.js";
import { compositeToolAbortFromError, compositeToolAbortOnHttpError } from "../../utils/safe-call.js";
import { periodToTwoWindows, type ComparisonPeriod } from "../../utils/analytics-period.js";

type BreakdownItem = { dimension: string; id: string; name: string; cost: number };

type TopLevelSpendRow = {
  name: string;
  id: string;
  cost: number;
  requestCount: number;
  percentage: number;
};

/** `response.data` when it is a plain object (excludes top-level array payloads). */
function analyticsDataObject(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const data = (raw as Record<string, unknown>).data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

/** Rows for model list or flat costs: `data` as array, or `data.items`. */
function analyticsTopLevelItemArray(raw: unknown): unknown[] {
  if (!raw || typeof raw !== "object") return [];
  const d = (raw as Record<string, unknown>).data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object" && Array.isArray((d as Record<string, unknown>).items)) {
    return (d as Record<string, unknown>).items as unknown[];
  }
  return [];
}

type CostBreakdownRow = {
  dimension: string;
  id: string;
  name: string;
  cost: number;
  requests: number;
  lastUsed: string | null;
};

/** Walk SaaS `data.breakdown` rows (shared by anomaly extraction and idle agent map). */
function forEachCostBreakdownRow(raw: unknown, fn: (row: CostBreakdownRow) => void): void {
  const data = analyticsDataObject(raw);
  if (!data) return;
  const breakdown = data.breakdown;
  if (!Array.isArray(breakdown)) return;
  for (const dim of breakdown) {
    if (!dim || typeof dim !== "object") continue;
    const dimension = String((dim as Record<string, unknown>).dimension ?? "");
    const dimItems = (dim as Record<string, unknown>).items;
    if (!Array.isArray(dimItems)) continue;
    for (const item of dimItems) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      fn({
        dimension,
        id: String(it.id ?? it.entityId ?? ""),
        name: String(it.name ?? it.label ?? ""),
        cost: Number(it.cost ?? it.totalCost ?? 0),
        requests: Number(it.requests ?? it.totalRequests ?? 0),
        lastUsed: (it.lastUsed ?? it.lastRequestAt ?? null) as string | null,
      });
    }
  }
}

export function extractCostBreakdownItems(raw: unknown): BreakdownItem[] {
  const items: BreakdownItem[] = [];
  forEachCostBreakdownRow(raw, (row) => {
    items.push({
      dimension: row.dimension,
      id: row.id,
      name: row.name,
      cost: row.cost,
    });
  });
  return items;
}

function mapItemsToTopLevelSpendRows(items: unknown[]): TopLevelSpendRow[] {
  const mapped = (items as Record<string, unknown>[]).map((it) => ({
    name: String(it.name ?? it.label ?? ""),
    id: String(it.id ?? it.entityId ?? ""),
    cost: Number(it.cost ?? it.totalCost ?? 0),
    requestCount: Number(it.requests ?? it.totalRequests ?? it.requestCount ?? 0),
    percentage: 0,
  }));
  const totalCost = mapped.reduce((s, i) => s + i.cost, 0);
  for (const m of mapped) {
    m.percentage = totalCost > 0 ? Math.round((m.cost / totalCost) * 10000) / 100 : 0;
  }
  return mapped;
}

function extractTopLevelSpendFromResponse(raw: unknown): TopLevelSpendRow[] {
  return mapItemsToTopLevelSpendRows(analyticsTopLevelItemArray(raw));
}

function isFiniteNumberSeries(v: unknown): v is number[] {
  return (
    Array.isArray(v)
    && v.length > 0
    && v.every((x) => typeof x === "number" && Number.isFinite(x))
  );
}

/** Sparkline numeric series from API; null if nothing usable (incl. empty object / only `period` / non-numeric arrays). */
export function sparklineSeriesFromResponse(raw: unknown): Record<string, number[]> | null {
  if (!raw || typeof raw !== "object") return null;
  const d = (raw as Record<string, unknown>).data;
  if (!d || typeof d !== "object") return null;
  const out: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
    if (k === "period") continue;
    if (isFiniteNumberSeries(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function classifySeverity(pct: number): "high" | "medium" | "low" {
  const abs = Math.abs(pct);
  if (abs >= 50) return "high";
  if (abs >= 20) return "medium";
  return "low";
}

function breakdownItemKey(p: BreakdownItem): string {
  return `${p.dimension}::${p.id}`;
}

export function buildAnomalyResult(
  currentItems: BreakdownItem[],
  previousItems: BreakdownItem[],
  overview: unknown,
) {
  const prevMap = new Map(previousItems.map((p) => [breakdownItemKey(p), p]));
  const totalCurrent = currentItems.reduce((s, i) => s + i.cost, 0);
  const totalPrevious = previousItems.reduce((s, i) => s + i.cost, 0);
  const totalChange = totalPrevious === 0 ? (totalCurrent > 0 ? 100 : 0)
    : ((totalCurrent - totalPrevious) / totalPrevious) * 100;

  const anomalies = currentItems.map((cur) => {
    const prev = prevMap.get(breakdownItemKey(cur));
    const prevCost = prev?.cost ?? 0;
    const changePct = prevCost === 0 ? (cur.cost > 0 ? 100 : 0)
      : ((cur.cost - prevCost) / prevCost) * 100;
    return {
      dimension: cur.dimension,
      entityName: cur.name,
      entityId: cur.id,
      currentCost: cur.cost,
      previousCost: prevCost,
      changePercent: Math.round(changePct * 100) / 100,
      severity: classifySeverity(changePct),
    };
  });

  anomalies.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  return {
    totalCostChange: {
      current: totalCurrent,
      previous: totalPrevious,
      changePercent: Math.round(totalChange * 100) / 100,
    },
    anomalies: anomalies.slice(0, 10),
    overview,
    _meta: { partial: false as boolean, failedSteps: [] as string[] },
  };
}

function detectTrend(points: number[]): "up" | "down" | "flat" {
  if (!points || points.length < 2) return "flat";
  const first = points[0];
  const last = points[points.length - 1];
  if (first === 0 && last === 0) return "flat";
  const changePct = first === 0 ? 100 : ((last - first) / Math.abs(first)) * 100;
  if (changePct > 5) return "up";
  if (changePct < -5) return "down";
  return "flat";
}

export function buildDashboardResult(
  live24h: unknown,
  sparklineData: Record<string, number[]> | null,
  overview: unknown,
) {
  const failedSteps: string[] = [];
  if (!live24h) failedSteps.push("live24h");
  if (!sparklineData) failedSteps.push("sparklines");
  if (!overview) failedSteps.push("overview");

  const sparklines: Record<string, { trend: string; points: number[] }> = {};
  if (sparklineData) {
    for (const [key, points] of Object.entries(sparklineData)) {
      sparklines[key] = { trend: detectTrend(points), points };
    }
  }

  return {
    realtime24h: live24h ?? null,
    sparklines,
    overview: overview ?? null,
    _meta: { partial: failedSteps.length > 0, failedSteps },
  };
}

type PeriodKPIs = { cost: number; requests: number; tokens: number };

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

export function buildCompareResult(
  entityType: string,
  entityId: string,
  current: PeriodKPIs,
  previous: PeriodKPIs,
) {
  const avgCur = current.requests > 0 ? current.cost / current.requests : 0;
  const avgPrev = previous.requests > 0 ? previous.cost / previous.requests : 0;
  return {
    entity: { type: entityType, id: entityId },
    current: { ...current, avgCostPerReq: Math.round(avgCur * 10000) / 10000 },
    previous: { ...previous, avgCostPerReq: Math.round(avgPrev * 10000) / 10000 },
    changes: {
      costChange: pctChange(current.cost, previous.cost),
      requestChange: pctChange(current.requests, previous.requests),
      tokenChange: pctChange(current.tokens, previous.tokens),
      avgCostChange: pctChange(avgCur, avgPrev),
    },
    _meta: { partial: false as boolean, failedSteps: [] as string[] },
  };
}

function toCallToolResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function registerManagerCompositeTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "diagnose_cost_anomaly",
    "Detects cost anomalies by comparing current vs previous period across departments, agents, and models. Returns ranked anomalies with severity and model breakdown. Consumes 4 API calls.",
    {
      period: z.enum(["7d", "30d"]).default("30d")
        .describe("Analysis window; compares with equal-length previous window"),
    },
    async ({ period }) => {
      const manager = requireManager(deps);
      const windows = periodToTwoWindows(period as ComparisonPeriod);

      try {
        const results = await Promise.allSettled([
          rateLimitedCall(() => manager.getAnalyticsCostsRange(windows.current.dateFrom, windows.current.dateTo)),
          rateLimitedCall(() => manager.getAnalyticsCostsRange(windows.previous.dateFrom, windows.previous.dateTo)),
          rateLimitedCall(() => manager.getWorkspaceOverview()),
          rateLimitedCall(() => manager.getAnalyticsModels(period as "7d" | "30d")),
        ]);

        const authAbort = compositeToolAbortOnHttpError(results, deps.mode);
        if (authAbort) return authAbort;

        const failedSteps: string[] = [];
        const vals = results.map((r, i) => {
          if (r.status === "fulfilled") return r.value;
          failedSteps.push(["costsCurrent", "costsPrevious", "overview", "models"][i]);
          return null;
        });

        const currentItems = extractCostBreakdownItems(vals[0]);
        const previousItems = extractCostBreakdownItems(vals[1]);
        const result = buildAnomalyResult(currentItems, previousItems, vals[2]);
        (result as Record<string, unknown>).modelBreakdown = vals[3] ?? null;
        result._meta.failedSteps = failedSteps;
        result._meta.partial = failedSteps.length > 0;
        return toCallToolResult(result);
      } catch (err) {
        const authAbort = compositeToolAbortFromError(err, deps.mode);
        if (authAbort) return authAbort;
        return errorResult(`diagnose_cost_anomaly failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "get_executive_dashboard",
    "One-call management overview: real-time 24h status + 7-day sparkline trends + period KPIs. Consumes 3 API calls.",
    {
      sparkline_metrics: z.string().default("all")
        .describe("Which sparkline metrics to include"),
    },
    async ({ sparkline_metrics }) => {
      const manager = requireManager(deps);

      try {
        const results = await Promise.allSettled([
          rateLimitedCall(() => manager.getLive24h(5)),
          rateLimitedCall(() => manager.getSparklines(sparkline_metrics)),
          rateLimitedCall(() => manager.getWorkspaceOverview()),
        ]);

        const authAbort = compositeToolAbortOnHttpError(results, deps.mode);
        if (authAbort) return authAbort;

        const dashboardStepNames = ["live24h", "sparklines", "overview"] as const;
        const apiFailedSteps: string[] = [];
        const vals = results.map((r, i) => {
          if (r.status === "fulfilled") return r.value;
          apiFailedSteps.push(dashboardStepNames[i]);
          return null;
        });

        const sparklineData = vals[1] ? sparklineSeriesFromResponse(vals[1]) : null;

        const result = buildDashboardResult(vals[0], sparklineData, vals[2]);
        const mergedFailed = [...new Set([...apiFailedSteps, ...result._meta.failedSteps])];
        result._meta.failedSteps = mergedFailed;
        result._meta.partial = mergedFailed.length > 0;
        return toCallToolResult(result);
      } catch (err) {
        const authAbort = compositeToolAbortFromError(err, deps.mode);
        if (authAbort) return authAbort;
        return errorResult(`get_executive_dashboard failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "drill_down_spend",
    "Drill from workspace total spend into department/agent/model breakdown, with optional second-level entity detail. " +
      "When dimension is model, entity_id is ignored (no second-level model drill).",
    {
      dimension: z.enum(["department", "agent", "model"]).default("department")
        .describe("Primary drill-down dimension"),
      entity_id: z.string().uuid().optional()
        .describe("Optional: department or agent UUID for second-level analytics; ignored when dimension is model"),
      period: z.enum(["7d", "30d"]).default("30d").describe("Time window"),
      limit: z.coerce.number().int().min(1).max(50).default(10)
        .describe("Max items to return per level"),
    },
    async ({ dimension, entity_id, period, limit }) => {
      const manager = requireManager(deps);
      try {
        const topLevelData = dimension === "model"
          ? await rateLimitedCall(() => manager.getAnalyticsModels(period as "7d" | "30d"))
          : await rateLimitedCall(() => manager.getAnalyticsCosts(period as "7d" | "30d"));

        const topLevel = extractTopLevelSpendFromResponse(topLevelData).slice(0, limit);

        let drillDown: unknown = null;
        if (entity_id) {
          if (dimension === "department") {
            drillDown = await rateLimitedCall(
              () => manager.getDepartmentAnalytics(entity_id, period as "7d" | "30d"),
            );
          } else if (dimension === "agent") {
            drillDown = await rateLimitedCall(
              () => manager.getAgentAnalytics(entity_id, period as "7d" | "30d"),
            );
          }
        }

        return toCallToolResult({
          dimension,
          period,
          limit,
          topLevel,
          drillDown,
          _meta: { partial: false, failedSteps: [] },
        });
      } catch (err) {
        const authAbort = compositeToolAbortFromError(err, deps.mode);
        if (authAbort) return authAbort;
        return errorResult(`drill_down_spend failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "find_idle_resources",
    "Scans virtual keys and agents for zero or low usage, returns cleanup suggestions. Consumes 2-3 API calls.",
    {
      period: z.enum(["7d", "30d"]).default("30d").describe("Lookback window"),
      include: z.enum(["all", "keys", "agents"]).default("all")
        .describe("Which resource type to scan"),
    },
    async ({ period, include }) => {
      const manager = requireManager(deps);
      try {
        const includeKeys = include === "all" || include === "keys";
        const includeAgents = include === "all" || include === "agents";

        const taskSpecs: { stepName: string; run: () => Promise<unknown> }[] = [];
        if (includeKeys) {
          taskSpecs.push({
            stepName: "virtual_keys",
            run: () => rateLimitedCall(() => manager.listVirtualKeys(1, 200)),
          });
        }
        if (includeAgents) {
          taskSpecs.push({
            stepName: "agents_list",
            run: () => rateLimitedCall(() => manager.listAgents(undefined, 1, 200)),
          });
          taskSpecs.push({
            stepName: "analytics_costs",
            run: () => rateLimitedCall(() => manager.getAnalyticsCosts(period as "7d" | "30d")),
          });
        }

        const results = await Promise.allSettled(taskSpecs.map((s) => s.run()));
        const authAbort = compositeToolAbortOnHttpError(results, deps.mode);
        if (authAbort) return authAbort;

        const failedSteps: string[] = [];
        const vals = results.map((r, i) => {
          if (r.status === "fulfilled") return r.value;
          failedSteps.push(taskSpecs[i].stepName);
          return null;
        });

        let idleKeys: unknown[] = [];
        let idleAgents: unknown[] = [];
        let totalKeys = 0;
        let totalAgents = 0;
        let truncatedKeys = false;
        let truncatedAgents = false;

        if (includeKeys && vals[0]) {
          const keysResp = vals[0] as Record<string, unknown>;
          const keysData = (keysResp.data ?? keysResp) as Record<string, unknown>;
          const keys = Array.isArray(keysData.data) ? keysData.data : (Array.isArray(keysData) ? keysData : []);
          totalKeys = keys.length;
          const totalFromApi = Number((keysData as Record<string, unknown>).total ?? keys.length);
          if (totalFromApi > 200) truncatedKeys = true;
          const avgSpent = keys.length > 0
            ? keys.reduce((s: number, k: Record<string, unknown>) => s + Number(k.spentCents ?? 0), 0) / keys.length
            : 0;
          idleKeys = keys
            .filter((k: Record<string, unknown>) => {
              const spent = Number(k.spentCents ?? 0);
              return spent === 0 || spent < avgSpent * 0.1;
            })
            .map((k: Record<string, unknown>) => ({
              id: k.id,
              label: k.label ?? k.name,
              spentCents: k.spentCents,
              status: Number(k.spentCents ?? 0) === 0 ? "idle" : "low_usage",
              suggestion: Number(k.spentCents ?? 0) === 0 ? "revoke" : "investigate",
              note: "Key idle detection uses lifetime spentCents, not period-scoped.",
            }));
        }

        if (includeAgents) {
          const agentIdx = includeKeys ? 1 : 0;
          const costsIdx = agentIdx + 1;
          const agentsRaw = vals[agentIdx];
          const costsRaw = vals[costsIdx];

          if (agentsRaw) {
            const agentsResp = agentsRaw as Record<string, unknown>;
            const agentsData = (agentsResp.data ?? agentsResp) as Record<string, unknown>;
            const agents = Array.isArray(agentsData.data) ? agentsData.data
              : (Array.isArray(agentsData) ? agentsData : []);
            totalAgents = agents.length;
            const totalFromApi = Number((agentsData as Record<string, unknown>).total ?? agents.length);
            if (totalFromApi > 200) truncatedAgents = true;

            const agentCostMap = new Map<string, { cost: number; requests: number; lastUsed: string | null }>();
            forEachCostBreakdownRow(costsRaw, (row) => {
              if (row.dimension !== "agent") return;
              agentCostMap.set(row.id, {
                cost: row.cost,
                requests: row.requests,
                lastUsed: row.lastUsed,
              });
            });

            const avgRequests = agentCostMap.size > 0
              ? [...agentCostMap.values()].reduce((s, v) => s + v.requests, 0) / agentCostMap.size
              : 0;

            idleAgents = agents
              .map((a: Record<string, unknown>) => {
                const agentId = String(a.id ?? "");
                const usage = agentCostMap.get(agentId);
                const requests = usage?.requests ?? 0;
                const cost = usage?.cost ?? 0;
                const lastUsed = usage?.lastUsed ?? (a.lastUsed as string | null) ?? null;
                const isIdle = requests === 0;
                const isLow = !isIdle && avgRequests > 0 && requests < avgRequests * 0.1;
                if (!isIdle && !isLow) return null;
                return {
                  id: agentId,
                  name: a.name ?? a.label,
                  cost,
                  requests,
                  lastUsed,
                  status: isIdle ? "idle" : "low_usage",
                  suggestion: isIdle ? "investigate" : "keep",
                };
              })
              .filter((x): x is NonNullable<typeof x> => x !== null);
          }
        }

        return toCallToolResult({
          period,
          idleKeys,
          idleAgents,
          summary: {
            totalKeys,
            idleKeysCount: idleKeys.length,
            totalAgents,
            idleAgentsCount: idleAgents.length,
          },
          _meta: {
            partial: failedSteps.length > 0,
            failedSteps,
            ...(truncatedKeys || truncatedAgents
              ? { truncated: true, truncatedNote: "pageSize=200 exceeded; not all resources were scanned." }
              : {}),
          },
        });
      } catch (err) {
        const authAbort = compositeToolAbortFromError(err, deps.mode);
        if (authAbort) return authAbort;
        return errorResult(`find_idle_resources failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "compare_entity_periods",
    "Compares a department/agent/member's KPIs across two consecutive time windows (current vs previous). Consumes 2 API calls.",
    {
      entity_type: z.enum(["department", "agent", "member"])
        .describe("Type of entity to compare"),
      entity_id: z.string().uuid().describe("Entity UUID"),
      period: z.enum(["7d", "30d"]).default("30d")
        .describe("Window length; previous window is same length, immediately preceding"),
    },
    async ({ entity_type, entity_id, period }) => {
      const manager = requireManager(deps);
      const windows = periodToTwoWindows(period as ComparisonPeriod);

      const filterKey = entity_type === "department" ? "departmentId"
        : entity_type === "agent" ? "agentId" : "memberId";

      try {
        const results = await Promise.allSettled([
          rateLimitedCall(() => manager.getSaasUsageForEntity(
            windows.current.dateFrom, windows.current.dateTo, { [filterKey]: entity_id },
          )),
          rateLimitedCall(() => manager.getSaasUsageForEntity(
            windows.previous.dateFrom, windows.previous.dateTo, { [filterKey]: entity_id },
          )),
        ]);

        const authAbort = compositeToolAbortOnHttpError(results, deps.mode);
        if (authAbort) return authAbort;

        const failedSteps: string[] = [];
        const vals = results.map((r, i) => {
          if (r.status === "fulfilled") return r.value;
          failedSteps.push(i === 0 ? "currentWindow" : "previousWindow");
          return null;
        });

        const aggregateSeries = (raw: unknown): PeriodKPIs => {
          if (!raw || typeof raw !== "object") return { cost: 0, requests: 0, tokens: 0 };
          const d = (raw as Record<string, unknown>).data;
          if (!d || typeof d !== "object") return { cost: 0, requests: 0, tokens: 0 };
          const series = (d as Record<string, unknown>).series;
          if (!Array.isArray(series)) return { cost: 0, requests: 0, tokens: 0 };
          return series.reduce(
            (acc: PeriodKPIs, day: Record<string, unknown>) => ({
              cost: acc.cost + Number(day.cost ?? 0),
              requests: acc.requests + Number(day.requests ?? 0),
              tokens: acc.tokens + Number(day.tokens ?? 0),
            }),
            { cost: 0, requests: 0, tokens: 0 },
          );
        };

        const curKPIs = aggregateSeries(vals[0]);
        const prevKPIs = aggregateSeries(vals[1]);

        const result = buildCompareResult(entity_type, entity_id, curKPIs, prevKPIs);
        result._meta.failedSteps = failedSteps;
        result._meta.partial = failedSteps.length > 0;
        (result.current as Record<string, unknown>).window = windows.current;
        (result.previous as Record<string, unknown>).window = windows.previous;
        return toCallToolResult(result);
      } catch (err) {
        const authAbort = compositeToolAbortFromError(err, deps.mode);
        if (authAbort) return authAbort;
        return errorResult(`compare_entity_periods failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
