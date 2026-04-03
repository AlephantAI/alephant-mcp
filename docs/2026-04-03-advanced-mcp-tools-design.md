# Alephant MCP — 高级工具设计

> 日期: 2026-04-03
> 状态: 草案
> 范围: alephant-mcp（仅 Manager/PAT 模式）

## 1. 背景与动机

现有 alephant-mcp 暴露 18 个工具（VK 7 个，Manager 15 个），覆盖基础用量汇总、
密钥管理、智能体/部门分析和策略操作。这些工具大致与后端 API 端点 1:1 映射。

对 `logs-collector` OpenAPI 规范（`openapi-zh.yml`，31 个端点）的分析表明，大量
分析能力尚未通过 MCP 工具暴露——包括实时仪表盘、时间序列指标、环比对比、成员维度
分析和迷你图趋势。

### 问题

1. **无实时可见性** — 所有现有工具使用日历日聚合；无法回答「此刻发生了什么？」
2. **无趋势分析** — 无任何指标的时间序列数据；无法绘图或检测趋势变化
3. **缺失成员维度** — 部门和智能体分析已有，但按用户追踪消费完全缺失
4. **无异常检测** — 用户必须在多个工具调用间手动对比数据才能发现问题
5. **无资源卫生** — 无法识别闲置虚拟密钥或低用量智能体

### 设计决策

与其将每个剩余 API 端点都映射为新工具（会将工具数膨胀到 35+ 并降低 AI 模型选择
准确率），我们采用**分层混合方案**：

- **原子层**：4 个新工具，覆盖现有工具无法替代的数据维度
- **组合层**：5 个新工具，内部编排多个 API 调用并返回结构化洞察
- **Prompt 层**：2 个新提示词，引导 AI 模型完成多步分析工作流

请求日志**不在范围内** — 后端日志端点要求 JWT 鉴权，PAT 无法访问。

## 2. 架构

### 设计原则

1. 遵循现有模式：`ManagerClient` 方法 → `safeCall()` → `server.tool()`
2. 所有新工具仅限 Manager 模式（PAT + X-Workspace-Id）
3. 组合工具使用 `Promise.allSettled()` 并发子调用；部分失败时通过 `_meta.partial`
   标志优雅降级
4. 不引入新依赖；复用 axios、zod 和现有工具函数
5. 每个 `server.tool()` 调用需包含人类可读的 `description` 字符串以提高 AI 模型
   的工具选择准确率

### API 路径映射

ManagerClient 与 **backend-saas-service** 通信，而非直接访问 logs-collector。
后端代理分析请求，因此路径与 OpenAPI 规范不同：

- OpenAPI `GET /v1/analytics/saas/live-24h` → ManagerClient `GET /api/v1/analytics/live-24h`
- OpenAPI `GET /v1/analytics/saas/sparklines` → ManagerClient `GET /api/v1/analytics/sparklines`
- OpenAPI `GET /v1/analytics/usage/timeseries` → ManagerClient `GET /api/v1/analytics/usage/timeseries`
- OpenAPI `GET /v1/analytics/saas/members/{id}/analytics` → ManagerClient `GET /api/v1/analytics/members/{id}/analytics`
- OpenAPI `GET /v1/analytics/saas/usage` → ManagerClient `GET /api/v1/analytics/usage`
- OpenAPI `GET /v1/analytics/saas/costs` → ManagerClient `GET /api/v1/analytics/costs`
- OpenAPI `GET /v1/analytics/saas/overview` → ManagerClient `GET /api/v1/analytics/overview`
- OpenAPI `GET /v1/analytics/saas/models` → ManagerClient `GET /api/v1/analytics/models`

实现前须对照 backend-saas-service 路由定义验证所有路径。

### 文件结构（新增部分）

```
src/
├── clients/
│   └── manager-client.ts              # +6 个新方法（4 原子 + 2 组合辅助）
├── tools/
│   ├── manager/
│   │   ├── analytics-atomic.ts        # 新增：4 个原子工具
│   │   └── analytics-composite.ts     # 新增：5 个组合工具
│   └── registry.ts                    # +2 行注册调用
├── prompts/
│   ├── health-check.ts                # 新增：workspace_health_check
│   ├── cost-deep-dive.ts              # 新增：cost_deep_dive
│   └── register.ts                    # +2 行注册
└── utils/
    └── analytics-period.ts            # 不变
```

### 工具数量

| 模式    | 变更前 | +原子 | +组合 | 合计    |
|---------|--------|-------|-------|---------|
| VK      | 7      | 0     | 0     | **7**   |
| Manager | 15     | +4    | +5    | **24**  |

Prompt 数量：现有 2 + 新增 2 = Manager **4 个**，VK 不变（1 个）。

## 3. 原子工具（4 个）

### 3.1 `get_live_24h`

**端点**：`GET /v1/analytics/saas/live-24h`

**必要性**：唯一的滚动 24 小时实时数据来源（Top 模型、Top 密钥、汇总 KPI）。
现有工具无法提供日以下粒度的可见性。

**参数**：

| 名称    | 类型 | 必填 | 默认值 | 说明                              |
|---------|------|------|--------|-----------------------------------|
| `limit` | int  | 否   | 5      | 每个面板区域的 Top-N 行数（1-10） |

**ManagerClient 方法**：

```typescript
async getLive24h(limit = 5): Promise<unknown> {
  const { data } = await this.http.get("/api/v1/analytics/live-24h", {
    params: { limit },
  });
  return data;
}
```

### 3.2 `get_usage_timeseries`

**端点**：`GET /v1/analytics/usage/timeseries`

**必要性**：获取指定指标时间序列数据的唯一方式，支持 6 种指标 × 2 种粒度。
对趋势分析和异常可视化至关重要。

**参数**：

| 名称          | 类型   | 必填 | 默认值 | 说明                                     |
|---------------|--------|------|--------|------------------------------------------|
| `metric`      | enum   | 是   | —      | `cost` \| `requests` \| `tokens` \| `avg_cost_per_req` \| `success_rate` \| `latency` |
| `granularity` | enum   | 否   | `day`  | `day` \| `hour`（`hour` 不支持 success_rate/latency） |
| `period`      | enum   | 否   | `30d`  | `7d` \| `30d` \| `3m` \| `6m` \| `12m`  |

**注意**：MCP 参数名为 `period`，但 API 查询参数名为 `preset`，实现时需做映射。

**ManagerClient 方法**：

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

**约束**：当 `granularity=hour` 与 `success_rate` 或 `latency` 组合使用时，
服务端返回 HTTP 400（`40010`）。工具描述中应注明此限制。

### 3.3 `get_member_analytics`

**端点**：`GET /v1/analytics/saas/members/{id}/analytics`

**必要性**：补齐实体维度三剑客（部门、智能体、**成员**）。
按用户的 FinOps 追踪必不可少。

**参数**：

| 名称        | 类型   | 必填 | 默认值 | 说明           |
|-------------|--------|------|--------|----------------|
| `member_id` | uuid   | 是   | —      | 成员/用户 UUID |
| `period`    | enum   | 否   | `30d`  | `24h` \| `7d` \| `30d` |

**ManagerClient 方法**：

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

**端点**：`GET /v1/analytics/saas/sparklines`

**必要性**：轻量级 7 天多指标趋势快照，一次调用即可获取。
数据独特，其他工具无法替代。

**参数**：

| 名称      | 类型   | 必填 | 默认值 | 说明                                         |
|-----------|--------|------|--------|----------------------------------------------|
| `metrics` | string | 否   | `all`  | 逗号分隔的指标键名或 `all`；如 `spend,requests` |

**ManagerClient 方法**：

```typescript
async getSparklines(metrics = "all"): Promise<unknown> {
  const { data } = await this.http.get("/api/v1/analytics/sparklines", {
    params: { metrics },
  });
  return data;
}
```

## 4. 组合工具（5 个）

所有组合工具共享以下约定：

- 使用 `Promise.allSettled()` 并发子调用
- 返回 `_meta: { partial: boolean, failedSteps: string[] }` 标示降级状态
- 每个子调用单独通过 `rateLimitedCall()` 做限流（详见第 6 节）
- 在 handler 内完成数据拼接/计算后返回

### 4.1 `diagnose_cost_anomaly`

**用途**：一次调用回答「有没有成本异常？异常在哪里？」

**内部编排**：
1. `getAnalyticsCostsRange(currentWindow)` — 当前窗口多维度成本分拆
2. `getAnalyticsCostsRange(previousWindow)` — 上一窗口（等长、紧邻前一段）用于对比
   — 需要**新辅助函数** `periodToTwoWindows()`，计算
   `{current: {dateFrom, dateTo}, previous: {dateFrom, dateTo}}`
3. `getWorkspaceOverview()` — 全局 KPI 基线
4. `getAnalyticsModels(period)` — 按模型分拆

**新工具函数** — `periodToTwoWindows(period: "7d" | "30d")`：
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

**计算逻辑**：
- 对两个窗口的 breakdown 分别求和，得到当前 vs 上期总成本
- 通过 ID 匹配两个窗口的实体，计算逐实体环比变化
- 找出 |变化率| 最大的前 3 个维度
- 按 |变化率| 降序排列，标记严重度：>50% = `high`，20-50% = `medium`，<20% = `low`

**注意**：`/v1/analytics/saas/costs` 端点返回**单窗口** breakdown（无内置上期
对比）。环比对比需要用手动计算的日期范围发起两次调用。

**参数**：

| 名称     | 类型 | 必填 | 默认值 | 说明                                        |
|----------|------|------|--------|---------------------------------------------|
| `period` | enum | 否   | `30d`  | `7d` \| `30d`；与等长的上一窗口做对比       |

**输出结构**：

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
  overview: object,       // 原始工作区总览
  _meta: { partial: boolean, failedSteps: string[] }
}
```

### 4.2 `get_executive_dashboard`

**用途**：管理层一览 —— 一次调用获得「全局现在怎么样 + 趋势往哪走」。

**内部编排**：
1. `getLive24h(5)` — 实时 24h 面板
2. `getSparklines("all")` — 7 天多指标趋势
3. `getWorkspaceOverview()` — 周期 KPI

**计算逻辑**：
- 直接聚合三块数据
- 为每个迷你图标记趋势方向（up / down / flat），通过比较首尾值判断

**参数**：

| 名称                | 类型   | 必填 | 默认值 | 说明                     |
|---------------------|--------|------|--------|--------------------------|
| `sparkline_metrics` | string | 否   | `all`  | 需要包含的迷你图指标     |

**输出结构**：

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
    // ...其他 KPI
  },
  _meta: { partial: boolean, failedSteps: string[] }
}
```

### 4.3 `drill_down_spend`

**用途**：从工作区总消费逐层钻透到根因 —— 「钱花在哪了？」

**内部编排**（按 `dimension` 参数分支）：

| `dimension`    | 一级调用                              | 二级调用（提供 `entity_id` 时）             |
|----------------|---------------------------------------|---------------------------------------------|
| `"department"` | `getAnalyticsCosts(period)` → 部门项  | `getDepartmentAnalytics(entity_id, period)` |
| `"agent"`      | `getAnalyticsCosts(period)` → 智能体项 | `getAgentAnalytics(entity_id, period)`      |
| `"model"`      | `getAnalyticsModels(period)`          | 不适用（模型无子钻透）                      |

**参数**：

| 名称        | 类型   | 必填 | 默认值       | 说明                                |
|-------------|--------|------|--------------|-------------------------------------|
| `dimension` | enum   | 否   | `department` | `department` \| `agent` \| `model`  |
| `entity_id` | uuid   | 否   | —            | 钻透到具体实体（二级）              |
| `period`    | enum   | 否   | `30d`        | `7d` \| `30d`                       |
| `limit`     | int    | 否   | 10           | 每级最大条数（1-50）                |

**输出结构**：

```typescript
{
  dimension: string,
  period: string,
  topLevel: Array<{
    name: string,
    id: string,
    cost: number,
    requestCount: number,
    percentage: number      // 占总量百分比
  }>,
  drillDown: null | {
    entityName: string,
    dailySeries: Array<object>,
    models: Array<object>
    // ...详情字段因实体类型而异
  },
  _meta: { partial: boolean, failedSteps: string[] }
}
```

### 4.4 `find_idle_resources`

**用途**：扫描低用量或零用量资源，给出清理建议 —— 「有没有浪费的密钥/智能体？」

**内部编排**：
1. `listVirtualKeys()` — 全量密钥列表（响应含每个密钥的 `spentCents` 和 `status`，
   足够做密钥级闲置检测，无需分析数据关联）
2. `listAgents()` — 全量智能体列表
3. `getAnalyticsCosts(period)` — 智能体维度消费 breakdown（仅用于智能体闲置检测；
   密钥使用其自身的 `spentCents` 字段）

**计算逻辑**：
- **密钥**：直接使用 `VirtualKeyResponse.spentCents` — `spentCents === 0` → `idle`；
  `spentCents > 0` 但低于所有密钥平均值 10% → `low_usage`。
  无需分析数据关联（成本 breakdown 维度是主密钥而非虚拟密钥）。
  **注意**：`spentCents` 是**累计生命周期**字段，非窗口范围内。`period` 参数
  仅影响智能体闲置检测。工具输出应注明此区别以避免用户混淆。
- **智能体**：将智能体列表与成本 breakdown 智能体维度通过 ID 关联。
  窗口内 0 请求 → `idle`；低于平均值 10% → `low_usage`。
  智能体闲置检测**是**窗口范围内的（使用给定窗口的成本 breakdown）。
- 按闲置程度排序，附加建议操作：`revoke` / `investigate` / `keep`

**分页处理**：`listVirtualKeys()` 和 `listAgents()` 均分页（默认 `pageSize=50`）。
handler 需循环获取所有页面，或使用较大的 `pageSize`（如 200）以减少往返。
若总数超出合理上限（如 500），截断并在 `_meta` 中注明。

**参数**：

| 名称      | 类型 | 必填 | 默认值 | 说明                         |
|-----------|------|------|--------|------------------------------|
| `period`  | enum | 否   | `30d`  | `7d` \| `30d` 回溯窗口      |
| `include` | enum | 否   | `all`  | `all` \| `keys` \| `agents` |

**输出结构**：

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

**用途**：任意实体的灵活环比对比 —— 「这个部门/智能体/成员上周 vs 本周表现如何？」

**内部编排**：

现有实体分析端点（`/agents/{id}/analytics`、`/departments/{id}/analytics`、
`/members/{id}/analytics`）仅接受相对于「今天」的 `days` 参数 — **无法**查询
上一窗口。

因此本工具使用 **SaaS 用量端点**（`GET /api/v1/analytics/usage`），该端点同时
支持绝对日期范围（`dateFrom`、`dateTo`）和实体筛选器（`agentId`、`memberId`、
`departmentId`）。需要**新 ManagerClient 方法**：

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

handler 调用此方法**两次**（当前窗口 + 上一窗口，通过 `periodToTwoWindows()` 计算），
然后聚合每次调用的日级序列以产出逐窗口汇总。

**参数**：

| 名称          | 类型   | 必填 | 默认值 | 说明                                        |
|---------------|--------|------|--------|---------------------------------------------|
| `entity_type` | enum   | 是   | —      | `department` \| `agent` \| `member`         |
| `entity_id`   | uuid   | 是   | —      | 实体 UUID                                   |
| `period`      | enum   | 否   | `30d`  | `7d` \| `30d` — 上一窗口等长且紧邻前一段   |

**输出结构**：

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
    costChange: number,       // 百分比
    requestChange: number,
    tokenChange: number,
    avgCostChange: number
  },
  _meta: { partial: boolean, failedSteps: string[] }
}
```

## 5. 增强 Prompt（2 个）

### 5.1 `workspace_health_check`（仅 Manager）

**用途**：引导 AI 完成系统化的工作区健康评估。

**参数**：

| 名称      | 类型 | 默认值  | 说明                                    |
|-----------|------|---------|------------------------------------------|
| `urgency` | enum | `quick` | `quick` = 实时快照；`thorough` = 全面   |

**快速模式**引导模型调用：
1. `get_live_24h` — 实时状态
2. `get_sparklines` — 7 天趋势快照
3. 输出简短健康摘要（正常/警告/严重 + 原因）

**详细模式**引导模型调用：
1. `get_executive_dashboard` — 全局视图
2. `diagnose_cost_anomaly` — 异常检测
3. `get_usage_timeseries(metric="success_rate")` — 成功率趋势
4. `get_usage_timeseries(metric="latency")` — 延迟趋势
5. 输出完整 Markdown 健康报告

**输出格式约束**（写入 prompt 文本）：
> "Output a Markdown health report with sections: Status (🟢/🟡/🔴), Key Metrics,
> Trends, Anomalies (if any), Recommended Actions. Do not assume data that tools
> did not return."

### 5.2 `cost_deep_dive`（仅 Manager）

**用途**：端到端成本调查 —— 从异常发现到根因定位到可行建议。

**参数**：

| 名称        | 类型   | 必填 | 默认值      | 说明                                      |
|-------------|--------|------|-------------|-------------------------------------------|
| `target`    | enum   | 否   | `workspace` | `workspace` \| `department` \| `agent`    |
| `target_id` | uuid   | 否   | —           | 当 target 为 department 或 agent 时必填   |

**引导工作流**：
1. `diagnose_cost_anomaly(period="30d")` — 发现异常维度
2. `drill_down_spend(dimension=<最异常维度>, period="30d")` — 钻透到实体
3. 对 Top 3 消费实体调用 `compare_entity_periods` — 环比验证
4. `get_cost_by_model` — 检查模型层面成本异常
5. `find_idle_resources`（如有闲置嫌疑）— 清理机会
6. 综合输出完整报告

**输出格式约束**（写入 prompt 文本）：
> "Output a Markdown deep-dive report: Executive Summary, Root Cause Analysis
> (with data evidence), Impact Quantification ($), Prioritized Recommendations
> (with expected savings). Never fabricate numbers not returned by tools."

## 6. 错误处理与降级

### 组合工具弹性

```typescript
async function compositeHandler(deps: ToolDeps): Promise<CallToolResult> {
  const manager = requireManager(deps);
  const results = await Promise.allSettled([
    rateLimitedCall(() => manager.getAnalyticsCostsRange(currentWindow)),
    rateLimitedCall(() => manager.getAnalyticsCostsRange(previousWindow)),
    rateLimitedCall(() => manager.getWorkspaceOverview()),
  ]);

  const failedSteps: string[] = [];
  const [a, b, c] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    failedSteps.push(["costsCurrentWindow", "costsPreviousWindow", "overview"][i]);
    return null;
  });

  const output = {
    /* ... 从 a, b, c 组装，跳过 null ... */
    _meta: { partial: failedSteps.length > 0, failedSteps },
  };

  return {
    content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
  };
}
```

### 限流

现有 `safeCall()` 包装整个工具 handler 并调用 `acquireGlobalRateSlot()` 一次。
但**组合工具每次调用发起多个 HTTP 请求** — 各个 `ManagerClient` 方法内部并不调用
`acquireGlobalRateSlot()`。

**解决方案**：组合工具 handler 需对每个子调用单独获取限流配额。引入辅助函数
`rateLimitedCall<T>(fn: () => Promise<T>): Promise<T>`，先调用
`acquireGlobalRateSlot()` 再执行 `fn()`。组合 handler 自身**不**使用
`safeCall()` 作为外层包装（避免双重限流），而是手动执行错误到 `CallToolResult`
的映射：捕获顶层错误，格式化为 `{ isError: true, content: [...] }`。

```typescript
async function rateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
  await acquireGlobalRateSlot();
  return fn();
}
```

**注意**：组合工具每次调用消耗 2-4 个限流配额。工具描述中应注明此点，
以避免 AI 模型过度调用组合工具。

## 7. 测试策略

- **单元测试**：每个新 `ManagerClient` 方法（mock axios）
- **单元测试**：组合逻辑（mock client 方法，验证组装与降级）
- **集成测试**：组合工具对接真实 API（可选，环境变量门控）
- 使用现有 `vitest` 配置

## 8. 范围外

- 请求日志（JWT-only，PAT 无法访问）
- VK 模式新增（不为 VK 添加任何原子或组合工具）
- MCP 资源（模型目录等 — 独立迭代）
- Python SDK（独立设计文档：`2026-04-01-track2-python-sdk-design.md`）

## 9. 工具描述（AI 选择辅助）

每个 `server.tool()` 注册必须包含清晰的描述字符串：

| 工具                      | 描述                                                                                         |
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

## 10. 新 ManagerClient 方法（共 6 个）

| 方法                     | 使用者           | 端点（backend-saas-service）                |
|--------------------------|------------------|---------------------------------------------|
| `getLive24h`             | 原子工具         | `GET /api/v1/analytics/live-24h`            |
| `getUsageTimeseries`     | 原子工具         | `GET /api/v1/analytics/usage/timeseries`    |
| `getMemberAnalytics`     | 原子工具         | `GET /api/v1/analytics/members/{id}/analytics` |
| `getSparklines`          | 原子工具         | `GET /api/v1/analytics/sparklines`          |
| `getAnalyticsCostsRange` | `diagnose_cost_anomaly` | `GET /api/v1/analytics/costs`（显式 dateFrom/dateTo） |
| `getSaasUsageForEntity`  | `compare_entity_periods` | `GET /api/v1/analytics/usage`（实体筛选 + 日期范围） |

**注意**：`getAnalyticsCostsRange` 与现有 `getAnalyticsCosts` 区分开来。后者使用
`periodToDateRange()` 辅助函数；新方法接受原始 `dateFrom`/`dateTo` 以支持
双窗口对比。

## 11. 总结

| 层       | 数量  | 名称                                                                                     |
|----------|-------|------------------------------------------------------------------------------------------|
| 原子     | 4     | `get_live_24h`、`get_usage_timeseries`、`get_member_analytics`、`get_sparklines`         |
| 组合     | 5     | `diagnose_cost_anomaly`、`get_executive_dashboard`、`drill_down_spend`、`find_idle_resources`、`compare_entity_periods` |
| Prompt   | 2     | `workspace_health_check`、`cost_deep_dive`                                               |
| **合计** | **11**| Manager 模式从 15→24 工具，2→4 prompt                                                    |
