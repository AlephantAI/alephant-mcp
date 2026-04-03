# Alephant MCP — Advanced Tools Design

> Date: 2026-04-03  
> Status: Draft  
> Scope: alephant-mcp (Manager/PAT mode only)

## 1. Background & Motivation

The existing alephant-mcp exposes 18 tools (7 VK, 15 Manager) covering basic usage
summaries, key management, agent/department analytics, and policy operations. These
tools map roughly 1:1 to backend API endpoints.

Analysis of the `logs-collector` OpenAPI spec (`openapi-zh.yml`, 31 endpoints) reveals
significant untapped analytical capabilities — real-time dashboards, time-series
metrics, period-over-period comparisons, member-dimension analytics, and sparkline
trends — none of which are accessible through the current MCP toolset.

### Problem

1. **No real-time visibility** — all existing tools use calendar-day aggregations;
   impossible to answer "what is happening right now?"
2. **No trend analysis** — no time-series data for any metric; can't plot or detect
   trajectory changes
3. **Missing member dimension** — department and agent analytics exist, but per-user
   spend tracking is absent
4. **No anomaly detection** — users must manually compare numbers across multiple
   tool calls to spot issues
5. **No resource hygiene** — no way to identify idle virtual keys or underutilized agents

### Design Decision

Rather than mapping every remaining API endpoint to a new tool (which would inflate
the tool count to 35+ and degrade AI model selection accuracy), we adopt a **layered
hybrid approach**:

- **Atomic layer**: 4 new tools for data dimensions that existing tools cannot cover
- **Composite layer**: 5 new tools that orchestrate multiple API calls internally
  and return structured insights
- **Prompt layer**: 2 new prompts that guide AI models through multi-step analytical
  workflows

Request logs are **out of scope** — the backend log endpoints require JWT auth which
PAT cannot satisfy.

## 2. Architecture

### Design Principles

1. Follow existing patterns: `ManagerClient` method → `safeCall()` → `server.tool()`
2. All new tools are Manager-mode only (PAT + X-Workspace-Id)
3. Composite tools use `Promise.allSettled()` for concurrent sub-calls; partial
   failures degrade gracefully with `_meta.partial` flag
4. No new dependencies; reuse axios, zod, existing utilities
5. Every `server.tool()` call includes a human-readable `description` string to
   improve AI model tool-selection accuracy

### API Path Mapping

ManagerClient talks to **backend-saas-service**, not directly to the logs-collector.
The backend proxies analytics requests, so paths differ from the OpenAPI spec:

- OpenAPI `GET /v1/analytics/saas/live-24h` → ManagerClient `GET /api/v1/analytics/live-24h`
- OpenAPI `GET /v1/analytics/saas/sparklines` → ManagerClient `GET /api/v1/analytics/sparklines`
- OpenAPI `GET /v1/analytics/usage/timeseries` → ManagerClient `GET /api/v1/analytics/usage/timeseries`
- OpenAPI `GET /v1/analytics/saas/members/{id}/analytics` → ManagerClient `GET /api/v1/analytics/members/{id}/analytics`
- OpenAPI `GET /v1/analytics/saas/usage` → ManagerClient `GET /api/v1/analytics/usage`

All paths must be verified against backend-saas-service route definitions before
implementation.

### File Structure (additions)

```
src/
├── clients/
│   └── manager-client.ts              # +6 new methods (4 atomic + 2 composite helpers)
├── tools/
│   ├── manager/
│   │   ├── analytics-atomic.ts        # NEW: 4 atomic tools
│   │   └── analytics-composite.ts     # NEW: 5 composite tools
│   └── registry.ts                    # +2 register calls
├── prompts/
│   ├── health-check.ts                # NEW: workspace_health_check
│   ├── cost-deep-dive.ts              # NEW: cost_deep_dive
│   └── register.ts                    # +2 register calls
└── utils/
    └── analytics-period.ts            # unchanged
```

### Tool Count

| Mode    | Before | +Atomic | +Composite | Total   |
|---------|--------|---------|------------|---------|
| VK      | 7      | 0       | 0          | **7**   |
| Manager | 15     | +4      | +5         | **24**  |

Prompt count: 2 existing + 2 new = **4 total** (Manager), 1 (VK, unchanged).

## 3. Atomic Tools (4)

### 3.1 `get_live_24h`

**Endpoint**: `GET /v1/analytics/saas/live-24h`

**Why it's needed**: Only source of rolling 24-hour real-time data (top models,
top keys, summary KPIs). No existing tool provides sub-day visibility.

**Parameters**:

| Name    | Type | Required | Default | Description                         |
|---------|------|----------|---------|-------------------------------------|
| `limit` | int  | No       | 5       | Top-N rows per panel (min 1, max 10)|

**ManagerClient method**:

```typescript
async getLive24h(limit = 5): Promise<unknown> {
  const { data } = await this.http.get("/api/v1/analytics/live-24h", {
    params: { limit },
  });
  return data;
}
```

### 3.2 `get_usage_timeseries`

**Endpoint**: `GET /v1/analytics/usage/timeseries`

**Why it's needed**: The only way to get metric-specific time-series data with
configurable granularity. Supports 6 metrics × 2 granularities. Essential for
trend analysis and anomaly visualization.

**Parameters**:

| Name          | Type   | Required | Default | Description                              |
|---------------|--------|----------|---------|------------------------------------------|
| `metric`      | enum   | Yes      | —       | `cost` \| `requests` \| `tokens` \| `avg_cost_per_req` \| `success_rate` \| `latency` |
| `granularity` | enum   | No       | `day`   | `day` \| `hour` (hour not supported for success_rate/latency) |
| `period`      | enum   | No       | `30d`   | `7d` \| `30d` \| `3m` \| `6m` \| `12m`  |

**ManagerClient method**:

```typescript
async getUsageTimeseries(
  metric: string,
  granularity: string,
  preset: string,
): Promise<unknown> {
  const { data } = await this.http.get("/api/v1/analytics/usage/timeseries", {
    params: { metric, granularity, preset },
  });
  return data;
}
```

**Constraint**: Server returns HTTP 400 (`40010`) when `granularity=hour` is used
with `success_rate` or `latency`. The tool description should note this.

### 3.3 `get_member_analytics`

**Endpoint**: `GET /v1/analytics/saas/members/{id}/analytics`

**Why it's needed**: Completes the entity-dimension trifecta (department, agent,
**member**). Required for per-user FinOps tracking.

**Parameters**:

| Name        | Type   | Required | Default | Description      |
|-------------|--------|----------|---------|------------------|
| `member_id` | uuid   | Yes      | —       | Member/user UUID |
| `period`    | enum   | No       | `30d`   | `24h` \| `7d` \| `30d` |

**ManagerClient method**:

```typescript
async getMemberAnalytics(
  memberId: string,
  period: AgentDeptPeriod,
): Promise<unknown> {
  const days = agentPeriodToDays(period);
  const { data } = await this.http.get(
    `/api/v1/analytics/members/${memberId}/analytics`,
    { params: { days } },
  );
  return data;
}
```

### 3.4 `get_sparklines`

**Endpoint**: `GET /v1/analytics/saas/sparklines`

**Why it's needed**: Lightweight 7-day multi-metric trend snapshot in a single call.
Unique data not available through any other tool.

**Parameters**:

| Name      | Type   | Required | Default | Description                                    |
|-----------|--------|----------|---------|------------------------------------------------|
| `metrics` | string | No       | `all`   | Comma-separated keys or `all`; e.g. `spend,requests` |

**ManagerClient method**:

```typescript
async getSparklines(metrics = "all"): Promise<unknown> {
  const { data } = await this.http.get("/api/v1/analytics/sparklines", {
    params: { metrics },
  });
  return data;
}
```

## 4. Composite Tools (5)

All composite tools share these conventions:

- Use `Promise.allSettled()` for concurrent sub-calls
- Return `_meta: { partial: boolean, failedSteps: string[] }` for degradation
  visibility
- Wrapped in `safeCall()` for rate limiting and top-level error handling
- Perform data joining / computation in the handler before returning

### 4.1 `diagnose_cost_anomaly`

**Purpose**: One-call answer to "are there cost anomalies and where?"

**Internal orchestration**:
1. `getAnalyticsCosts(currentWindow)` — current window multi-dimension breakdown
2. `getAnalyticsCosts(previousWindow)` — previous window (equal-length, immediately
   preceding) for comparison — requires **new helper** `periodToTwoWindows()` that
   computes `{current: {dateFrom, dateTo}, previous: {dateFrom, dateTo}}`
3. `getWorkspaceOverview()` — global KPI baseline
4. `getAnalyticsModels(period)` — per-model split

**New utility** — `periodToTwoWindows(period: "7d" | "30d")`:
```typescript
function periodToTwoWindows(period: "7d" | "30d") {
  const days = period === "7d" ? 7 : 30;
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const currentStart = new Date(todayUtc);
  currentStart.setUTCDate(currentStart.getUTCDate() - (days - 1));
  const previousEnd = new Date(currentStart);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    current: { dateFrom: fmt(currentStart), dateTo: fmt(todayUtc) },
    previous: { dateFrom: fmt(previousStart), dateTo: fmt(previousEnd) },
  };
}
```

**Computation logic**:
- Sum cost from each window's breakdown to get total current vs total previous
- Match entities by ID across the two windows to compute per-entity delta
- Find top 3 dimensions with largest |changePercent|
- Rank by |change|, tag severity: >50% = `high`, 20-50% = `medium`, <20% = `low`

**Note**: The `/v1/analytics/saas/costs` endpoint returns a **single-window**
breakdown (no built-in previous period). Period-over-period comparison requires
two separate calls with manually computed date ranges.

**Parameters**:

| Name     | Type | Required | Default | Description                                      |
|----------|------|----------|---------|--------------------------------------------------|
| `period` | enum | No       | `30d`   | `7d` \| `30d`; compared with equal previous window |

**Output structure**:

```typescript
{
  totalCostChange: {
    current: number,
    previous: number,
    changePercent: number
  },
  anomalies: Array<{
    dimension: string,    // "department" | "agent" | "master_key"
    entityName: string,
    entityId: string,
    currentCost: number,
    previousCost: number,
    changePercent: number,
    severity: "high" | "medium" | "low"
  }>,
  overview: object,       // raw workspace overview
  _meta: { partial: boolean, failedSteps: string[] }
}
```

### 4.2 `get_executive_dashboard`

**Purpose**: Management-level one-call global view — "how is everything right now
and which direction are we heading?"

**Internal orchestration**:
1. `getLive24h(5)` — real-time 24h panel
2. `getSparklines("all")` — 7-day multi-metric trends
3. `getWorkspaceOverview()` — period KPIs

**Computation logic**:
- Aggregate three data blocks directly
- Tag each sparkline with trend direction (up / down / flat) by comparing first
  and last values

**Parameters**:

| Name                | Type   | Required | Default | Description                    |
|---------------------|--------|----------|---------|--------------------------------|
| `sparkline_metrics` | string | No       | `all`   | Which sparkline metrics to include |

**Output structure**:

```typescript
{
  realtime24h: {
    topModels: Array<object>,
    topKeys: Array<object>,
    summary: object
  },
  sparklines: Record<string, {
    trend: "up" | "down" | "flat",
    points: Array<number>
  }>,
  overview: {
    totalRequests: number,
    totalCost: number,
    successRate: number,
    // ...other KPIs
  },
  _meta: { partial: boolean, failedSteps: string[] }
}
```

### 4.3 `drill_down_spend`

**Purpose**: Layer-by-layer drill from workspace total spend to root cause —
"where is the money going?"

**Internal orchestration** (varies by `dimension`):
- `dimension = "department"` → `getAnalyticsCosts(period)` department breakdown
- `dimension = "agent"` → costs agent dimension
- `dimension = "model"` → `getAnalyticsModels(period)`
- If `entity_id` provided → call corresponding analytics method for second-level detail

**Parameters**:

| Name        | Type   | Required | Default      | Description                              |
|-------------|--------|----------|--------------|------------------------------------------|
| `dimension` | enum   | No       | `department` | `department` \| `agent` \| `model`       |
| `entity_id` | uuid   | No       | —            | Drill into specific entity (2nd level)   |
| `period`    | enum   | No       | `30d`        | `7d` \| `30d`                            |
| `limit`     | int    | No       | 10           | Max items per level (1-50)               |

**Output structure**:

```typescript
{
  dimension: string,
  period: string,
  topLevel: Array<{
    name: string,
    id: string,
    cost: number,
    requestCount: number,
    percentage: number      // share of total
  }>,
  drillDown: null | {
    entityName: string,
    dailySeries: Array<object>,
    models: Array<object>
    // ...detail fields vary by entity type
  },
  _meta: { partial: boolean, failedSteps: string[] }
}
```

### 4.4 `find_idle_resources`

**Purpose**: Scan for low-usage or zero-usage resources with cleanup suggestions —
"are there wasted keys or agents?"

**Internal orchestration**:
1. `listVirtualKeys()` — full key list (response includes `spentCents` and `status`
   per key, sufficient for key-level idle detection without analytics join)
2. `listAgents()` — full agent list
3. `getAnalyticsCosts(period)` — agent-dimension spend breakdown (for agent idle
   detection only; keys use their own `spentCents` field)

**Computation logic**:
- **Keys**: Use `VirtualKeyResponse.spentCents` directly — `spentCents === 0` → `idle`;
  `spentCents > 0` but below 10% of average across all keys → `low_usage`.
  No analytics join needed (costs breakdown has master_key dimension, not virtual key).
- **Agents**: Join agent list with costs breakdown agent dimension by entity ID.
  0 requests in window → `idle`; below 10% of average → `low_usage`.
- Sort by idleness, attach suggestion: `revoke` / `investigate` / `keep`

**Parameters**:

| Name      | Type | Required | Default | Description                     |
|-----------|------|----------|---------|---------------------------------|
| `period`  | enum | No       | `30d`   | `7d` \| `30d` lookback window  |
| `include` | enum | No       | `all`   | `all` \| `keys` \| `agents`    |

**Output structure**:

```typescript
{
  period: string,
  idleKeys: Array<{
    id: string,
    label: string,
    lastUsed: string | null,
    status: "idle" | "low_usage",
    suggestion: "revoke" | "investigate" | "keep"
  }>,
  idleAgents: Array<{
    id: string,
    name: string,
    lastUsed: string | null,
    totalCost: number,
    status: "idle" | "low_usage",
    suggestion: "investigate" | "keep"
  }>,
  summary: {
    totalKeys: number,
    idleKeys: number,
    totalAgents: number,
    idleAgents: number
  },
  _meta: { partial: boolean, failedSteps: string[] }
}
```

### 4.5 `compare_entity_periods`

**Purpose**: Flexible period-over-period comparison for any entity — "how does this
department/agent/member compare this week vs last week?"

**Internal orchestration**:

The existing entity analytics endpoints (`/agents/{id}/analytics`,
`/departments/{id}/analytics`, `/members/{id}/analytics`) only accept a relative
`days` parameter anchored to today — they **cannot** query a previous window.

Instead, this tool uses the **SaaS usage endpoint** (`GET /api/v1/analytics/usage`)
which supports both absolute date ranges (`dateFrom`, `dateTo`) and entity filters
(`agentId`, `memberId`, `departmentId`). This requires a **new ManagerClient method**:

```typescript
async getSaasUsageForEntity(
  dateFrom: string,
  dateTo: string,
  entityFilter: { agentId?: string; memberId?: string; departmentId?: string },
): Promise<unknown> {
  const { data } = await this.http.get("/api/v1/analytics/usage", {
    params: { dateFrom, dateTo, ...entityFilter },
  });
  return data;
}
```

The handler calls this method **twice** (current window + previous window, computed
via `periodToTwoWindows()`), then aggregates the daily series from each call to
produce per-period totals.

**Parameters**:

| Name          | Type   | Required | Default | Description                                |
|---------------|--------|----------|---------|--------------------------------------------|
| `entity_type` | enum   | Yes      | —       | `department` \| `agent` \| `member`        |
| `entity_id`   | uuid   | Yes      | —       | Entity UUID                                |
| `period`      | enum   | No       | `30d`   | `7d` \| `30d` — previous window is same length, immediately preceding |

**Output structure**:

```typescript
{
  entity: { type: string, id: string },
  current: {
    window: { dateFrom: string, dateTo: string },
    cost: number,
    requests: number,
    tokens: number,
    avgCostPerReq: number
  },
  previous: {
    window: { dateFrom: string, dateTo: string },
    cost: number,
    requests: number,
    tokens: number,
    avgCostPerReq: number
  },
  changes: {
    costChange: number,       // percentage
    requestChange: number,
    tokenChange: number,
    avgCostChange: number
  },
  _meta: { partial: boolean, failedSteps: string[] }
}
```

## 5. Enhanced Prompts (2)

### 5.1 `workspace_health_check` (Manager only)

**Purpose**: Guide the AI through a systematic workspace health assessment.

**Parameters**:

| Name      | Type | Default | Description                                   |
|-----------|------|---------|-----------------------------------------------|
| `urgency` | enum | `quick` | `quick` = realtime snapshot; `thorough` = full |

**Quick mode** directs the model to call:
1. `get_live_24h` — real-time status
2. `get_sparklines` — 7-day trend snapshot
3. Output brief health summary (normal / warning / critical + reason)

**Thorough mode** directs the model to call:
1. `get_executive_dashboard` — global view
2. `diagnose_cost_anomaly` — anomaly detection
3. `get_usage_timeseries(metric="success_rate")` — success rate trend
4. `get_usage_timeseries(metric="latency")` — latency trend
5. Output full Markdown health report

**Output format constraint** (in prompt text):
> "Output a Markdown health report with sections: Status (🟢/🟡/🔴), Key Metrics,
> Trends, Anomalies (if any), Recommended Actions. Do not assume data that tools
> did not return."

### 5.2 `cost_deep_dive` (Manager only)

**Purpose**: End-to-end cost investigation — from anomaly detection to root cause
to actionable recommendations.

**Parameters**:

| Name        | Type   | Required | Default     | Description                                  |
|-------------|--------|----------|-------------|----------------------------------------------|
| `target`    | enum   | No       | `workspace` | `workspace` \| `department` \| `agent`       |
| `target_id` | uuid   | No       | —           | Required when target is department or agent   |

**Directed workflow**:
1. `diagnose_cost_anomaly(period="30d")` — discover anomaly dimensions
2. `drill_down_spend(dimension=<most anomalous>, period="30d")` — drill to entities
3. `compare_entity_periods` for top 3 spenders — validate with period comparison
4. `get_cost_by_model` — check model-level cost anomalies
5. `find_idle_resources` (if idle suspicion) — cleanup opportunities
6. Synthesize full report

**Output format constraint** (in prompt text):
> "Output a Markdown deep-dive report: Executive Summary, Root Cause Analysis
> (with data evidence), Impact Quantification ($), Prioritized Recommendations
> (with expected savings). Never fabricate numbers not returned by tools."

## 6. Error Handling & Degradation

### Composite Tool Resilience

```typescript
async function compositeHandler(deps: ToolDeps): Promise<CallToolResult> {
  const manager = requireManager(deps);
  const results = await Promise.allSettled([
    manager.methodA(),
    manager.methodB(),
    manager.methodC(),
  ]);

  const failedSteps: string[] = [];
  const [a, b, c] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    failedSteps.push(["methodA", "methodB", "methodC"][i]);
    return null;
  });

  const output = {
    /* ... assemble from a, b, c, skipping nulls ... */
    _meta: { partial: failedSteps.length > 0, failedSteps },
  };

  return {
    content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
  };
}
```

### Rate Limiting

The existing `safeCall()` wraps entire tool handlers and calls `acquireGlobalRateSlot()`
once. However, **composite tools make multiple HTTP requests per invocation** — the
individual `ManagerClient` methods do NOT call `acquireGlobalRateSlot()` internally.

**Solution**: Composite tool handlers must wrap each sub-call in its own rate-limit
acquisition. Introduce a helper `rateLimitedCall<T>(fn: () => Promise<T>): Promise<T>`
that calls `acquireGlobalRateSlot()` then executes `fn()`. The composite handler
itself does NOT use `safeCall()` for the outer wrapper (to avoid double rate-limiting);
instead it handles error mapping manually or via a lightweight `compositeCall()` wrapper.

```typescript
async function rateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
  await acquireGlobalRateSlot();
  return fn();
}

// Usage in composite handler:
const results = await Promise.allSettled([
  rateLimitedCall(() => manager.getAnalyticsCosts(currentWindow)),
  rateLimitedCall(() => manager.getAnalyticsCosts(previousWindow)),
  rateLimitedCall(() => manager.getWorkspaceOverview()),
]);
```

**Consideration**: Composite tools consume 2-4 rate-limit slots per invocation.
The tool descriptions should note this so AI models don't over-call composites.

## 7. Testing Strategy

- **Unit tests** for each new `ManagerClient` method (mock axios)
- **Unit tests** for composite logic (mock client methods, verify assembly & degradation)
- **Integration tests** for composite tools with real API (optional, env-gated)
- Use existing `vitest` setup

## 8. Out of Scope

- Request logs (JWT-only, PAT cannot access)
- VK-mode additions (no new atomic or composite tools for VK)
- MCP Resources (model catalog etc. — separate track)
- Python SDK (separate design doc: `2026-04-01-track2-python-sdk-design.md`)

## 9. Tool Descriptions for AI Selection

Each `server.tool()` registration must include a clear description string:

| Tool                      | Description                                                                                  |
|---------------------------|----------------------------------------------------------------------------------------------|
| `get_live_24h`            | "Real-time rolling 24-hour dashboard: top models, top keys, and summary KPIs."               |
| `get_usage_timeseries`    | "Time-series data for a single metric (cost/requests/tokens/latency/success_rate) with day or hour granularity." |
| `get_member_analytics`    | "Per-member (user) daily cost/request/token series over a lookback period."                   |
| `get_sparklines`          | "Lightweight 7-day multi-metric trend snapshot (spend, requests, tokens, success, latency)."  |
| `diagnose_cost_anomaly`   | "Detects cost anomalies by comparing current vs previous period across departments, agents, and models. Returns ranked anomalies with severity. Consumes 4 API calls." |
| `get_executive_dashboard` | "One-call management overview: real-time 24h status + 7-day sparkline trends + period KPIs. Consumes 3 API calls." |
| `drill_down_spend`        | "Drill from workspace total spend into department/agent/model breakdown, with optional second-level entity detail." |
| `find_idle_resources`     | "Scans virtual keys and agents for zero or low usage, returns cleanup suggestions. Consumes 2-3 API calls." |
| `compare_entity_periods`  | "Compares a department/agent/member's KPIs across two consecutive time windows (current vs previous). Consumes 2 API calls." |

## 10. New ManagerClient Methods (6 total)

| Method                   | Used by              | Endpoint (backend-saas-service)           |
|--------------------------|----------------------|-------------------------------------------|
| `getLive24h`             | Atomic tool          | `GET /api/v1/analytics/live-24h`          |
| `getUsageTimeseries`     | Atomic tool          | `GET /api/v1/analytics/usage/timeseries`  |
| `getMemberAnalytics`     | Atomic tool          | `GET /api/v1/analytics/members/{id}/analytics` |
| `getSparklines`          | Atomic tool          | `GET /api/v1/analytics/sparklines`        |
| `getAnalyticsCostsRange` | `diagnose_cost_anomaly` | `GET /api/v1/analytics/costs` (with explicit dateFrom/dateTo) |
| `getSaasUsageForEntity`  | `compare_entity_periods` | `GET /api/v1/analytics/usage` (with entity filters + date range) |

**Note**: `getAnalyticsCostsRange` is distinct from the existing `getAnalyticsCosts`
which uses `periodToDateRange()`. The new method accepts raw `dateFrom`/`dateTo`
to enable two-window comparison.

## 11. Summary

| Layer     | Count | Names                                                                                    |
|-----------|-------|------------------------------------------------------------------------------------------|
| Atomic    | 4     | `get_live_24h`, `get_usage_timeseries`, `get_member_analytics`, `get_sparklines`         |
| Composite | 5     | `diagnose_cost_anomaly`, `get_executive_dashboard`, `drill_down_spend`, `find_idle_resources`, `compare_entity_periods` |
| Prompt    | 2     | `workspace_health_check`, `cost_deep_dive`                                               |
| **Total** | **11**| Manager mode goes from 15→24 tools, 2→4 prompts                                         |
