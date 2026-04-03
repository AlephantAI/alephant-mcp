# 高级 MCP 工具实施计划

> **给 Agent 执行者：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务执行本计划。步骤使用 `- [ ]` 复选框语法追踪进度。

**目标：** 为 alephant-mcp Manager 模式新增 9 个工具（4 原子 + 5 组合）和 2 个 Prompt，覆盖实时监控、趋势分析、异常检测、消费钻透和闲置资源发现。

**架构：** 分层混合方案 — 原子层直接映射不可替代的 API 端点，组合层内部编排多个 API 调用后返回结构化洞察。组合工具使用 `Promise.allSettled()` 并发、`rateLimitedCall()` 逐调用限流、`_meta.partial` 降级标记。

**技术栈：** TypeScript ESM / @modelcontextprotocol/sdk / axios / zod / vitest

**设计文档：** `docs/2026-04-03-advanced-mcp-tools-design.md`

---

## 文件结构总览

| 操作 | 路径 | 职责 |
|------|------|------|
| 修改 | `src/utils/analytics-period.ts` | 新增 `periodToTwoWindows()` |
| 创建 | `src/utils/analytics-period.test.ts`（追加） | 新函数测试 |
| 创建 | `src/utils/rate-limited-call.ts` | `rateLimitedCall()` 辅助函数 |
| 创建 | `src/utils/rate-limited-call.test.ts` | 限流辅助测试 |
| 修改 | `src/clients/manager-client.ts` | +6 个新方法 |
| 创建 | `src/clients/manager-client.test.ts` | 新方法单元测试 |
| 创建 | `src/tools/manager/analytics-atomic.ts` | 4 个原子工具注册 |
| 创建 | `src/tools/manager/analytics-composite.ts` | 5 个组合工具注册 |
| 创建 | `src/tools/manager/analytics-composite.test.ts` | 组合工具逻辑测试 |
| 创建 | `src/prompts/health-check.ts` | `workspace_health_check` prompt |
| 创建 | `src/prompts/cost-deep-dive.ts` | `cost_deep_dive` prompt |
| 修改 | `src/prompts/register.ts` | +2 行注册 |
| 修改 | `src/tools/registry.ts` | +2 行注册 |

---

## Task 1: 工具函数 — `periodToTwoWindows`

**文件：**
- 修改: `src/utils/analytics-period.ts`
- 修改: `src/utils/analytics-period.test.ts`

- [ ] **步骤 1: 写失败测试**

在 `src/utils/analytics-period.test.ts` 中：

首先，将现有的 import 行：
```typescript
import { periodToDateRange, agentPeriodToDays } from "./analytics-period.js";
```
修改为：
```typescript
import { periodToDateRange, agentPeriodToDays, periodToTwoWindows } from "./analytics-period.js";
```

然后在文件末尾追加以下测试：

```typescript
describe("periodToTwoWindows", () => {
  it("returns two 7-day windows for 7d", () => {
    const result = periodToTwoWindows("7d");
    const curFrom = new Date(result.current.dateFrom);
    const curTo = new Date(result.current.dateTo);
    const prevFrom = new Date(result.previous.dateFrom);
    const prevTo = new Date(result.previous.dateTo);
    const curDays = Math.round((curTo.getTime() - curFrom.getTime()) / 86400000);
    const prevDays = Math.round((prevTo.getTime() - prevFrom.getTime()) / 86400000);
    expect(curDays).toBe(6);
    expect(prevDays).toBe(6);
  });

  it("previous window ends the day before current window starts", () => {
    const result = periodToTwoWindows("30d");
    const curFrom = new Date(result.current.dateFrom);
    const prevTo = new Date(result.previous.dateTo);
    const gap = Math.round((curFrom.getTime() - prevTo.getTime()) / 86400000);
    expect(gap).toBe(1);
  });

  it("returns two 30-day windows for 30d", () => {
    const result = periodToTwoWindows("30d");
    const curFrom = new Date(result.current.dateFrom);
    const curTo = new Date(result.current.dateTo);
    const diffDays = Math.round((curTo.getTime() - curFrom.getTime()) / 86400000);
    expect(diffDays).toBe(29);
  });

  it("current window dateTo is today in UTC", () => {
    const result = periodToTwoWindows("7d");
    const today = new Date();
    const todayStr = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
      .toISOString().slice(0, 10);
    expect(result.current.dateTo).toBe(todayStr);
  });
});
```

- [ ] **步骤 2: 运行测试确认失败**

运行: `npx vitest run src/utils/analytics-period.test.ts`
期望: FAIL — `periodToTwoWindows` 未导出

- [ ] **步骤 3: 实现 `periodToTwoWindows`**

在 `src/utils/analytics-period.ts` 末尾追加：

```typescript
export type ComparisonPeriod = "7d" | "30d";

export function periodToTwoWindows(period: ComparisonPeriod): {
  current: { dateFrom: string; dateTo: string };
  previous: { dateFrom: string; dateTo: string };
} {
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

- [ ] **步骤 4: 运行测试确认通过**

运行: `npx vitest run src/utils/analytics-period.test.ts`
期望: 全部 PASS

- [ ] **步骤 5: 提交**

```bash
git add src/utils/analytics-period.ts src/utils/analytics-period.test.ts
git commit -m "feat(utils): add periodToTwoWindows for dual-window comparison"
```

---

## Task 2: 工具函数 — `rateLimitedCall`

**文件：**
- 创建: `src/utils/rate-limited-call.ts`
- 创建: `src/utils/rate-limited-call.test.ts`

- [ ] **步骤 1: 写失败测试**

创建 `src/utils/rate-limited-call.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.ALEPHANT_RATE_LIMIT_RPM = "0";
});

import { rateLimitedCall } from "./rate-limited-call.js";
import { resetGlobalRateLimiter } from "./rate-limiter.js";

describe("rateLimitedCall", () => {
  beforeEach(() => {
    process.env.ALEPHANT_RATE_LIMIT_RPM = "0";
    resetGlobalRateLimiter();
  });

  afterEach(() => {
    resetGlobalRateLimiter();
  });

  it("returns the resolved value from fn", async () => {
    const result = await rateLimitedCall(() => Promise.resolve({ ok: true }));
    expect(result).toEqual({ ok: true });
  });

  it("propagates errors from fn", async () => {
    await expect(
      rateLimitedCall(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
  });

  it("calls fn exactly once", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    await rateLimitedCall(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **步骤 2: 运行测试确认失败**

运行: `npx vitest run src/utils/rate-limited-call.test.ts`
期望: FAIL — 模块不存在

- [ ] **步骤 3: 实现**

创建 `src/utils/rate-limited-call.ts`：

```typescript
import { acquireGlobalRateSlot } from "./rate-limiter.js";

export async function rateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
  await acquireGlobalRateSlot();
  return fn();
}
```

- [ ] **步骤 4: 运行测试确认通过**

运行: `npx vitest run src/utils/rate-limited-call.test.ts`
期望: 全部 PASS

- [ ] **步骤 5: 提交**

```bash
git add src/utils/rate-limited-call.ts src/utils/rate-limited-call.test.ts
git commit -m "feat(utils): add rateLimitedCall for composite tool sub-call throttling"
```

---

## Task 3: ManagerClient — 4 个原子方法

**文件：**
- 修改: `src/clients/manager-client.ts`
- 创建: `src/clients/manager-client.test.ts`

- [ ] **步骤 1: 写失败测试**

创建 `src/clients/manager-client.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ManagerClient } from "./manager-client.js";

function mockAxiosGet(client: ManagerClient, responseData: unknown) {
  vi.spyOn(client.http, "get").mockResolvedValue({ data: responseData });
}

describe("ManagerClient atomic methods", () => {
  let client: ManagerClient;

  beforeEach(() => {
    client = new ManagerClient("https://test.example.com", "pat-test", "ws-id-test");
  });

  describe("getLive24h", () => {
    it("calls /api/v1/analytics/live-24h with limit param", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getLive24h(3);
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/live-24h", {
        params: { limit: 3 },
      });
    });

    it("defaults limit to 5", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getLive24h();
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/live-24h", {
        params: { limit: 5 },
      });
    });
  });

  describe("getUsageTimeseries", () => {
    it("passes metric, granularity, and preset as params", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getUsageTimeseries("cost", "day", "30d");
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/usage/timeseries", {
        params: { metric: "cost", granularity: "day", preset: "30d" },
      });
    });
  });

  describe("getMemberAnalytics", () => {
    it("calls /api/v1/analytics/members/{id}/analytics with days", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getMemberAnalytics("uuid-123", "7d");
      expect(client.http.get).toHaveBeenCalledWith(
        "/api/v1/analytics/members/uuid-123/analytics",
        { params: { days: 7 } },
      );
    });
  });

  describe("getSparklines", () => {
    it("defaults metrics to 'all'", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getSparklines();
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/sparklines", {
        params: { metrics: "all" },
      });
    });

    it("passes custom metrics", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getSparklines("spend,requests");
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/sparklines", {
        params: { metrics: "spend,requests" },
      });
    });
  });
});
```

- [ ] **步骤 2: 运行测试确认失败**

运行: `npx vitest run src/clients/manager-client.test.ts`
期望: FAIL — 方法不存在

- [ ] **步骤 3: 实现 4 个原子方法**

在 `src/clients/manager-client.ts` 的 `ManagerClient` 类中，在 `listModels()` 方法前追加：

```typescript
  async getLive24h(limit = 5): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/analytics/live-24h", {
      params: { limit },
    });
    return data;
  }

  async getUsageTimeseries(metric: string, granularity: string, preset: string): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/analytics/usage/timeseries", {
      params: { metric, granularity, preset },
    });
    return data;
  }

  async getMemberAnalytics(memberId: string, period: AgentDeptPeriod): Promise<unknown> {
    const days = agentPeriodToDays(period);
    const { data } = await this.http.get(
      `/api/v1/analytics/members/${memberId}/analytics`,
      { params: { days } },
    );
    return data;
  }

  async getSparklines(metrics = "all"): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/analytics/sparklines", {
      params: { metrics },
    });
    return data;
  }
```

- [ ] **步骤 4: 运行测试确认通过**

运行: `npx vitest run src/clients/manager-client.test.ts`
期望: 全部 PASS

- [ ] **步骤 5: 提交**

```bash
git add src/clients/manager-client.ts src/clients/manager-client.test.ts
git commit -m "feat(client): add 4 atomic ManagerClient methods (live24h, timeseries, member, sparklines)"
```

---

## Task 4: ManagerClient — 2 个组合辅助方法

**文件：**
- 修改: `src/clients/manager-client.ts`
- 修改: `src/clients/manager-client.test.ts`

- [ ] **步骤 1: 写失败测试**

在 `src/clients/manager-client.test.ts` 中追加：

```typescript
describe("ManagerClient composite helper methods", () => {
  let client: ManagerClient;

  beforeEach(() => {
    client = new ManagerClient("https://test.example.com", "pat-test", "ws-id-test");
  });

  describe("getAnalyticsCostsRange", () => {
    it("passes explicit dateFrom and dateTo", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getAnalyticsCostsRange("2026-03-01", "2026-03-30");
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/costs", {
        params: { dateFrom: "2026-03-01", dateTo: "2026-03-30" },
      });
    });
  });

  describe("getSaasUsageForEntity", () => {
    it("passes date range and agentId filter", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getSaasUsageForEntity("2026-03-01", "2026-03-30", { agentId: "agent-uuid" });
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/usage", {
        params: { dateFrom: "2026-03-01", dateTo: "2026-03-30", agentId: "agent-uuid" },
      });
    });

    it("passes date range and departmentId filter", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getSaasUsageForEntity("2026-03-01", "2026-03-30", { departmentId: "dept-uuid" });
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/usage", {
        params: { dateFrom: "2026-03-01", dateTo: "2026-03-30", departmentId: "dept-uuid" },
      });
    });

    it("passes date range and memberId filter", async () => {
      mockAxiosGet(client, { code: 0, data: {} });
      await client.getSaasUsageForEntity("2026-03-01", "2026-03-30", { memberId: "member-uuid" });
      expect(client.http.get).toHaveBeenCalledWith("/api/v1/analytics/usage", {
        params: { dateFrom: "2026-03-01", dateTo: "2026-03-30", memberId: "member-uuid" },
      });
    });
  });
});
```

- [ ] **步骤 2: 运行测试确认失败**

运行: `npx vitest run src/clients/manager-client.test.ts`
期望: FAIL — 方法不存在

- [ ] **步骤 3: 实现 2 个方法**

在 `src/clients/manager-client.ts` 的 `ManagerClient` 类中追加：

```typescript
  async getAnalyticsCostsRange(dateFrom: string, dateTo: string): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/analytics/costs", {
      params: { dateFrom, dateTo },
    });
    return data;
  }

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

- [ ] **步骤 4: 运行测试确认通过**

运行: `npx vitest run src/clients/manager-client.test.ts`
期望: 全部 PASS

- [ ] **步骤 5: 提交**

```bash
git add src/clients/manager-client.ts src/clients/manager-client.test.ts
git commit -m "feat(client): add getAnalyticsCostsRange and getSaasUsageForEntity for composite tools"
```

---

## Task 5: 原子工具注册

**文件：**
- 创建: `src/tools/manager/analytics-atomic.ts`

- [ ] **步骤 1: 创建原子工具注册文件**

创建 `src/tools/manager/analytics-atomic.ts`：

```typescript
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
      limit: z.number().int().min(1).max(10).default(5)
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
```

- [ ] **步骤 2: 验证 TypeScript 编译**

运行: `npx tsc --noEmit`
期望: 无报错（若报错检查 `server.tool` 的 description 重载签名是否正确，
SDK ≥1.27 支持 `server.tool(name, description, schema, handler)` 四参数形式）

- [ ] **步骤 3: 提交**

```bash
git add src/tools/manager/analytics-atomic.ts
git commit -m "feat(tools): register 4 atomic analytics tools (live24h, timeseries, member, sparklines)"
```

---

## Task 6: 组合工具 — `diagnose_cost_anomaly` 与 `get_executive_dashboard`

**文件：**
- 创建: `src/tools/manager/analytics-composite.ts`
- 创建: `src/tools/manager/analytics-composite.test.ts`

- [ ] **步骤 1: 写组合工具测试**

创建 `src/tools/manager/analytics-composite.test.ts`：

```typescript
import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.ALEPHANT_RATE_LIMIT_RPM = "0";
});

import { buildAnomalyResult, buildDashboardResult } from "./analytics-composite.js";

describe("buildAnomalyResult", () => {
  it("computes changePercent correctly", () => {
    const currentBreakdown = [
      { dimension: "agent", id: "a1", name: "Agent-1", cost: 150 },
      { dimension: "agent", id: "a2", name: "Agent-2", cost: 50 },
    ];
    const previousBreakdown = [
      { dimension: "agent", id: "a1", name: "Agent-1", cost: 100 },
      { dimension: "agent", id: "a2", name: "Agent-2", cost: 100 },
    ];
    const result = buildAnomalyResult(currentBreakdown, previousBreakdown, null);
    expect(result.totalCostChange.current).toBe(200);
    expect(result.totalCostChange.previous).toBe(200);
    expect(result.totalCostChange.changePercent).toBe(0);
    expect(result.anomalies.length).toBe(2);
    const a1 = result.anomalies.find((a: { entityId: string }) => a.entityId === "a1");
    expect(a1?.changePercent).toBe(50);
    expect(a1?.severity).toBe("high");
  });

  it("tags severity correctly", () => {
    const current = [{ dimension: "department", id: "d1", name: "Dept", cost: 130 }];
    const previous = [{ dimension: "department", id: "d1", name: "Dept", cost: 100 }];
    const result = buildAnomalyResult(current, previous, null);
    expect(result.anomalies[0].severity).toBe("medium");
  });

  it("handles missing previous entity as 100% increase", () => {
    const current = [{ dimension: "agent", id: "new", name: "New", cost: 50 }];
    const previous: typeof current = [];
    const result = buildAnomalyResult(current, previous, null);
    expect(result.anomalies[0].changePercent).toBe(100);
    expect(result.anomalies[0].severity).toBe("high");
  });
});

describe("buildDashboardResult", () => {
  it("tags sparkline trends correctly", () => {
    const sparklineData = {
      spend: [10, 12, 15, 18, 20, 22, 25],
      requests: [100, 100, 100, 100, 100, 100, 100],
      tokens: [500, 480, 460, 440, 420, 400, 380],
    };
    const result = buildDashboardResult(null, sparklineData, null);
    expect(result.sparklines.spend.trend).toBe("up");
    expect(result.sparklines.requests.trend).toBe("flat");
    expect(result.sparklines.tokens.trend).toBe("down");
  });

  it("handles null sparkline data gracefully", () => {
    const result = buildDashboardResult(null, null, null);
    expect(result._meta.partial).toBe(true);
    expect(result._meta.failedSteps).toContain("sparklines");
  });
});
```

- [ ] **步骤 2: 运行测试确认失败**

运行: `npx vitest run src/tools/manager/analytics-composite.test.ts`
期望: FAIL — 模块不存在

- [ ] **步骤 3: 实现 `analytics-composite.ts`（前半：anomaly + dashboard + 导出的纯逻辑函数）**

创建 `src/tools/manager/analytics-composite.ts`：

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ToolDeps } from "../deps.js";
import { requireManager } from "../deps.js";
import { rateLimitedCall } from "../../utils/rate-limited-call.js";
import { periodToTwoWindows, type ComparisonPeriod } from "../../utils/analytics-period.js";

type BreakdownItem = { dimension: string; id: string; name: string; cost: number };

function classifySeverity(pct: number): "high" | "medium" | "low" {
  const abs = Math.abs(pct);
  if (abs > 50) return "high";
  if (abs >= 20) return "medium";
  return "low";
}

export function buildAnomalyResult(
  currentItems: BreakdownItem[],
  previousItems: BreakdownItem[],
  overview: unknown,
) {
  const prevMap = new Map(previousItems.map((p) => [p.id, p]));
  const totalCurrent = currentItems.reduce((s, i) => s + i.cost, 0);
  const totalPrevious = previousItems.reduce((s, i) => s + i.cost, 0);
  const totalChange = totalPrevious === 0 ? (totalCurrent > 0 ? 100 : 0)
    : ((totalCurrent - totalPrevious) / totalPrevious) * 100;

  const anomalies = currentItems.map((cur) => {
    const prev = prevMap.get(cur.id);
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

        const failedSteps: string[] = [];
        const vals = results.map((r, i) => {
          if (r.status === "fulfilled") return r.value;
          failedSteps.push(["costsCurrent", "costsPrevious", "overview", "models"][i]);
          return null;
        });

        const extractItems = (raw: unknown): BreakdownItem[] => {
          if (!raw || typeof raw !== "object") return [];
          const d = (raw as Record<string, unknown>).data;
          if (!d || typeof d !== "object") return [];
          const breakdown = (d as Record<string, unknown>).breakdown;
          if (!Array.isArray(breakdown)) return [];
          const items: BreakdownItem[] = [];
          for (const dim of breakdown) {
            if (!dim || typeof dim !== "object") continue;
            const dimension = (dim as Record<string, unknown>).dimension as string;
            const dimItems = (dim as Record<string, unknown>).items;
            if (!Array.isArray(dimItems)) continue;
            for (const item of dimItems) {
              if (!item || typeof item !== "object") continue;
              const it = item as Record<string, unknown>;
              items.push({
                dimension,
                id: String(it.id ?? it.entityId ?? ""),
                name: String(it.name ?? it.label ?? ""),
                cost: Number(it.cost ?? it.totalCost ?? 0),
              });
            }
          }
          return items;
        };

        const currentItems = extractItems(vals[0]);
        const previousItems = extractItems(vals[1]);
        const result = buildAnomalyResult(currentItems, previousItems, vals[2]);
        (result as Record<string, unknown>).modelBreakdown = vals[3] ?? null;
        result._meta.failedSteps = failedSteps;
        result._meta.partial = failedSteps.length > 0;
        return toCallToolResult(result);
      } catch (err) {
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

        const vals = results.map((r) => r.status === "fulfilled" ? r.value : null);

        let sparklineData: Record<string, number[]> | null = null;
        if (vals[1] && typeof vals[1] === "object") {
          const d = (vals[1] as Record<string, unknown>).data;
          if (d && typeof d === "object") {
            sparklineData = {};
            for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
              if (k === "period") continue;
              if (Array.isArray(v)) sparklineData[k] = v as number[];
            }
          }
        }

        const result = buildDashboardResult(vals[0], sparklineData, vals[2]);
        return toCallToolResult(result);
      } catch (err) {
        return errorResult(`get_executive_dashboard failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
```

> **注意**：此步只包含 `diagnose_cost_anomaly` 和 `get_executive_dashboard`。
> 其余 3 个组合工具在 Task 7 追加。

- [ ] **步骤 4: 运行测试确认通过**

运行: `npx vitest run src/tools/manager/analytics-composite.test.ts`
期望: 全部 PASS

- [ ] **步骤 5: 验证编译**

运行: `npx tsc --noEmit`
期望: 无报错

- [ ] **步骤 6: 提交**

```bash
git add src/tools/manager/analytics-composite.ts src/tools/manager/analytics-composite.test.ts
git commit -m "feat(tools): add diagnose_cost_anomaly and get_executive_dashboard composite tools"
```

---

## Task 7: 组合工具 — `drill_down_spend`、`find_idle_resources`、`compare_entity_periods`

**文件：**
- 修改: `src/tools/manager/analytics-composite.ts`
- 修改: `src/tools/manager/analytics-composite.test.ts`

- [ ] **步骤 1: 追加测试**

在 `analytics-composite.test.ts` 中追加：

```typescript
import { buildCompareResult } from "./analytics-composite.js";

describe("buildCompareResult", () => {
  it("computes changes as percentage", () => {
    const current = { cost: 200, requests: 100, tokens: 5000 };
    const previous = { cost: 100, requests: 80, tokens: 4000 };
    const result = buildCompareResult("agent", "id-1", current, previous);
    expect(result.changes.costChange).toBe(100);
    expect(result.changes.requestChange).toBe(25);
    expect(result.changes.tokenChange).toBe(25);
  });

  it("handles zero previous gracefully", () => {
    const current = { cost: 50, requests: 10, tokens: 500 };
    const previous = { cost: 0, requests: 0, tokens: 0 };
    const result = buildCompareResult("department", "d-1", current, previous);
    expect(result.changes.costChange).toBe(100);
  });
});
```

同时追加 3 个组合工具 handler 的基本测试（mock ManagerClient，验证降级行为）：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.ALEPHANT_RATE_LIMIT_RPM = "0";
});

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerManagerCompositeTools } from "./analytics-composite.js";

function createMockManager(overrides: Record<string, unknown> = {}) {
  return {
    getAnalyticsCosts: vi.fn().mockResolvedValue({ data: { breakdown: [] } }),
    getAnalyticsModels: vi.fn().mockResolvedValue({ data: [] }),
    getDepartmentAnalytics: vi.fn().mockResolvedValue({ data: {} }),
    getAgentAnalytics: vi.fn().mockResolvedValue({ data: {} }),
    listVirtualKeys: vi.fn().mockResolvedValue({ data: { data: [] } }),
    listAgents: vi.fn().mockResolvedValue({ data: { data: [] } }),
    getSaasUsageForEntity: vi.fn().mockResolvedValue({ data: { series: [] } }),
    ...overrides,
  };
}

describe("drill_down_spend handler", () => {
  it("returns topLevel as spec-shaped array with limit applied", async () => {
    const mockManager = createMockManager({
      getAnalyticsCosts: vi.fn().mockResolvedValue({
        data: { items: [
          { name: "A", id: "1", cost: 80, requests: 10 },
          { name: "B", id: "2", cost: 20, requests: 5 },
          { name: "C", id: "3", cost: 10, requests: 2 },
        ] },
      }),
    });
    // handler 应截取前 2 条
    const result = JSON.parse("..."); // 仅验证结构
    // 实际测试通过 McpServer.tool 注册后调用 handler
  });
});

describe("find_idle_resources handler", () => {
  it("returns partial=true when one API call fails", async () => {
    const mockManager = createMockManager({
      listVirtualKeys: vi.fn().mockRejectedValue(new Error("timeout")),
    });
    // handler 应降级，idleKeys=[], partial=true, failedSteps 包含 step_0
  });

  it("fills idleAgents when agents have 0 requests in cost breakdown", async () => {
    const mockManager = createMockManager({
      listAgents: vi.fn().mockResolvedValue({
        data: { data: [
          { id: "ag-1", name: "Agent1" },
          { id: "ag-2", name: "Agent2" },
        ] },
      }),
      getAnalyticsCosts: vi.fn().mockResolvedValue({
        data: { breakdown: [
          { dimension: "agent", items: [
            { id: "ag-1", cost: 0, requests: 0 },
          ] },
        ] },
      }),
    });
    // handler 应标记 ag-1 idle, ag-2 idle(未出现在 breakdown 中)
    // totalAgents=2, idleAgentsCount=2
  });
});

describe("compare_entity_periods handler", () => {
  it("returns partial=true when previous window call fails", async () => {
    const mockManager = createMockManager({
      getSaasUsageForEntity: vi.fn()
        .mockResolvedValueOnce({ data: { series: [{ cost: 10, requests: 5, tokens: 100 }] } })
        .mockRejectedValueOnce(new Error("timeout")),
    });
    // handler 应降级，previous KPIs 为 0，partial=true
  });
});
```

> **注意**：上述 handler 测试为结构性示例，实现时需通过 `McpServer` 注册后调用 handler 或提取 handler 函数进行测试。核心验证目标是降级行为（`_meta.partial` 和 `failedSteps`）以及数据正确填充。

- [ ] **步骤 2: 运行测试确认失败**

运行: `npx vitest run src/tools/manager/analytics-composite.test.ts`
期望: `buildCompareResult` 导入失败

- [ ] **步骤 3: 实现 `buildCompareResult` 纯函数**

在 `analytics-composite.ts` 中 `registerManagerCompositeTools` 函数前追加：

```typescript
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
```

- [ ] **步骤 4: 运行测试确认通过**

运行: `npx vitest run src/tools/manager/analytics-composite.test.ts`
期望: 全部 PASS

- [ ] **步骤 5: 在 `registerManagerCompositeTools` 中追加 3 个组合工具注册**

在 `registerManagerCompositeTools` 函数体末尾（`get_executive_dashboard` 注册代码之后）追加：

```typescript
  // --- drill_down_spend ---
  server.tool(
    "drill_down_spend",
    "Drill from workspace total spend into department/agent/model breakdown, with optional second-level entity detail.",
    {
      dimension: z.enum(["department", "agent", "model"]).default("department")
        .describe("Primary drill-down dimension"),
      entity_id: z.string().uuid().optional()
        .describe("Optional: drill into a specific entity for second-level detail"),
      period: z.enum(["7d", "30d"]).default("30d").describe("Time window"),
      limit: z.number().int().min(1).max(50).default(10)
        .describe("Max items to return per level"),
    },
    async ({ dimension, entity_id, period, limit }) => {
      const manager = requireManager(deps);
      try {
        const topLevelData = dimension === "model"
          ? await rateLimitedCall(() => manager.getAnalyticsModels(period as "7d" | "30d"))
          : await rateLimitedCall(() => manager.getAnalyticsCosts(period as "7d" | "30d"));

        // Transform topLevel API response into spec-required structure:
        // Array<{ name, id, cost, requestCount, percentage }>
        const extractTopLevel = (raw: unknown): Array<{ name: string; id: string; cost: number; requestCount: number; percentage: number }> => {
          if (!raw || typeof raw !== "object") return [];
          const d = (raw as Record<string, unknown>).data;
          const items = Array.isArray(d) ? d
            : (d && typeof d === "object" && Array.isArray((d as Record<string, unknown>).items))
              ? (d as Record<string, unknown>).items as unknown[]
              : [];
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
        };

        const topLevel = extractTopLevel(topLevelData).slice(0, limit);

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
        return errorResult(`drill_down_spend failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // --- find_idle_resources ---
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
        const tasks: Promise<unknown>[] = [];
        const includeKeys = include === "all" || include === "keys";
        const includeAgents = include === "all" || include === "agents";

        if (includeKeys) tasks.push(rateLimitedCall(() => manager.listVirtualKeys(1, 200)));
        if (includeAgents) {
          tasks.push(rateLimitedCall(() => manager.listAgents(undefined, 1, 200)));
          tasks.push(rateLimitedCall(() => manager.getAnalyticsCosts(period as "7d" | "30d")));
        }

        const results = await Promise.allSettled(tasks);
        const failedSteps: string[] = [];
        const vals = results.map((r, i) => {
          if (r.status === "fulfilled") return r.value;
          failedSteps.push(`step_${i}`);
          return null;
        });

        let idleKeys: unknown[] = [];
        let idleAgents: unknown[] = [];
        let totalKeys = 0;
        let totalAgents = 0;
        let truncatedKeys = false;
        let truncatedAgents = false;

        // --- Keys idle detection ---
        // Note: pageSize=200 is the maximum per-page limit of the API.
        // If the workspace has more than 200 keys, results will be truncated.
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

        // --- Agents idle detection ---
        // Associate agent list with cost breakdown's agent dimension by ID.
        // pageSize=200 is the API maximum; if workspace has more agents, results are truncated.
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

            // Build a map of agentId -> cost/requests from costs breakdown
            const agentCostMap = new Map<string, { cost: number; requests: number; lastUsed: string | null }>();
            if (costsRaw && typeof costsRaw === "object") {
              const cd = (costsRaw as Record<string, unknown>).data;
              if (cd && typeof cd === "object") {
                const breakdown = (cd as Record<string, unknown>).breakdown;
                if (Array.isArray(breakdown)) {
                  for (const dim of breakdown) {
                    if (!dim || typeof dim !== "object") continue;
                    if ((dim as Record<string, unknown>).dimension !== "agent") continue;
                    const items = (dim as Record<string, unknown>).items;
                    if (!Array.isArray(items)) continue;
                    for (const item of items) {
                      if (!item || typeof item !== "object") continue;
                      const it = item as Record<string, unknown>;
                      agentCostMap.set(String(it.id ?? it.entityId ?? ""), {
                        cost: Number(it.cost ?? it.totalCost ?? 0),
                        requests: Number(it.requests ?? it.totalRequests ?? 0),
                        lastUsed: (it.lastUsed ?? it.lastRequestAt ?? null) as string | null,
                      });
                    }
                  }
                }
              }
            }

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
              .filter(Boolean);
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
        return errorResult(`find_idle_resources failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  // --- compare_entity_periods ---
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
        return errorResult(`compare_entity_periods failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
```

- [ ] **步骤 6: 运行全部测试**

运行: `npx vitest run`
期望: 全部 PASS

- [ ] **步骤 7: 验证编译**

运行: `npx tsc --noEmit`
期望: 无报错

- [ ] **步骤 8: 提交**

```bash
git add src/tools/manager/analytics-composite.ts src/tools/manager/analytics-composite.test.ts
git commit -m "feat(tools): add drill_down_spend, find_idle_resources, compare_entity_periods composite tools"
```

---

## Task 8: 新 Prompt — `workspace_health_check` 和 `cost_deep_dive`

**文件：**
- 创建: `src/prompts/health-check.ts`
- 创建: `src/prompts/cost-deep-dive.ts`
- 修改: `src/prompts/register.ts`

- [ ] **步骤 1: 创建 `health-check.ts`**

```typescript
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
```

- [ ] **步骤 2: 创建 `cost-deep-dive.ts`**

```typescript
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
```

- [ ] **步骤 3: 更新 `register.ts`**

在 `src/prompts/register.ts` 中添加导入和注册：

```typescript
import { registerHealthCheckPrompt } from "./health-check.js";
import { registerCostDeepDivePrompt } from "./cost-deep-dive.js";

// 在 registerPrompts 函数体的 manager 分支中追加：
  if (mode === "manager") {
    registerCostOptimizationPrompt(server);
    registerHealthCheckPrompt(server);
    registerCostDeepDivePrompt(server);
  }
```

- [ ] **步骤 4: 验证编译**

运行: `npx tsc --noEmit`
期望: 无报错

- [ ] **步骤 5: 提交**

```bash
git add src/prompts/health-check.ts src/prompts/cost-deep-dive.ts src/prompts/register.ts
git commit -m "feat(prompts): add workspace_health_check and cost_deep_dive prompts"
```

---

## Task 9: 注册表更新 + 全量验证

**文件：**
- 修改: `src/tools/registry.ts`

- [ ] **步骤 1: 更新 `registry.ts`**

在 `src/tools/registry.ts` 中：

```typescript
import { registerManagerAtomicTools } from "./manager/analytics-atomic.js";
import { registerManagerCompositeTools } from "./manager/analytics-composite.js";

// 在 manager 分支中追加（registerManagerPolicyTools 之后）：
  registerManagerAtomicTools(server, deps);
  registerManagerCompositeTools(server, deps);
```

更新注释：
```typescript
/** Registers 7 tools in vk mode, 24 in manager mode (27 unique names total; shared tools in both). */
```

- [ ] **步骤 2: 验证编译**

运行: `npx tsc --noEmit`
期望: 无报错

- [ ] **步骤 3: 运行全量测试**

运行: `npx vitest run`
期望: 全部 PASS

- [ ] **步骤 4: 构建**

运行: `npm run build`
期望: 成功，`dist/` 输出无报错

- [ ] **步骤 5: 冒烟测试（可选，需配置环境变量）**

若有 PAT 和 Workspace-Id，可运行：
```bash
ALEPHANT_PAT=xxx ALEPHANT_WORKSPACE_ID=yyy node dist/index.js
```
确认启动无报错，工具列表包含 24 个 manager 工具。

- [ ] **步骤 6: 提交**

```bash
git add src/tools/registry.ts
git commit -m "feat(registry): register atomic and composite tools, update tool count to 24"
```

---

## 执行摘要

| Task | 内容 | 预计步骤 |
|------|------|----------|
| 1 | `periodToTwoWindows` 工具函数 | 5 步 |
| 2 | `rateLimitedCall` 辅助函数 | 5 步 |
| 3 | ManagerClient 4 个原子方法 | 5 步 |
| 4 | ManagerClient 2 个组合辅助方法 | 5 步 |
| 5 | 原子工具注册（4 个） | 3 步 |
| 6 | 组合工具：anomaly + dashboard | 6 步 |
| 7 | 组合工具：drill + idle + compare | 8 步 |
| 8 | 2 个新 Prompt + 注册 | 5 步 |
| 9 | 注册表更新 + 全量验证 | 6 步 |
| **合计** | | **48 步** |
