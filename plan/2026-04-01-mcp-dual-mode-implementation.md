# Alephant MCP 双模式（VK + PAT）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use @superpowers:subagent-driven-development (recommended) or @superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `alephant-mcp` 从单模式（仅 VK + 旧 Cockpit 路径 + Mock）重构为设计文档 §5 定义的双模式 MCP Server：启动时识别 VK 或 PAT，按模式注册 **18** 个工具（管理者 11 个：不含 `get_request_logs`，见下）、2 个 Prompt、1 个静态 Resource；HTTP 层统一限流与 `safeCall` 错误映射；**不使用 Mock**，直接对接真实后端 API。

**与后端路由对齐（2026-04-01）：** `GET /api/v1/workspaces/:id/stats` 为 **JWT-only**（`RequireAuth`），PAT 不可用；`get_workspace_overview` 在 MCP 侧改为 **`GET /api/v1/analytics/overview`**（`authOrPAT` + `X-Workspace-Id`）。`GET /api/v1/logs` 亦为 **JWT-only**，**本迭代暂不实现** `get_request_logs` 工具（未来若后端对 PAT 开放或换 BFF 再补）。

**Architecture:** `index.ts` 承担设计文档 §5.1 中 `server.ts` 的职责（创建 `McpServer`、注册工具/Prompt/Resource）；`detectAuthMode(env)` → `'vk' | 'manager'`；按模式构造 `CockpitClient`（Bearer VK → **仅** `/api/v1/cockpit/*`）与 **独立的** `GET /api/v1/models` 调用（见 Task 6，**不得**把 `list_available_models` 挂在 cockpit 路径下）或 `ManagerClient`（Bearer PAT + `X-Workspace-Id` / `ALEPHANT_WORKSPACE_ID` → `/api/v1/*`）；`registerTools(server, mode, clients)` 分发共享/VK 专属/管理者专属工具。所有经 HTTP 的出口在 `safeCall` 前 `await globalRateLimiter.acquire()`。`smithery.yaml` 与 npm 目录注册见 `plan/2026-04-01-track1-npm-distribution.md`，避免重复造轮子。

**Tech Stack:** TypeScript (ESM), `@modelcontextprotocol/sdk`, `axios`, `zod`, `vitest`（新增，用于单元测试）。

**Spec:** `alephant-mcp/docs/2026-03-31-alephant-mcp-dual-mode-design.md`（§2.1、§5 全文；§3–§4 为后端契约，本仓库仅消费）。

**前置与阻塞（必须阅读）：**

| 依赖 | 说明 |
|------|------|
| **Cockpit API（实现计划）** | 见 **`backend-saas-service/plan/2026-04-01-cockpit-api-mcp-prerequisite.md`**。交付 §4.4–§4.5 端点（`/api/v1/cockpit/health`、`scope`、`usage-summary`、`daily-costs`、`cost-by-model`、`budget-status`、`recent-requests`）。**当前** `src/client.ts` 使用的 `/api/cockpit/dashboard`、`live-metrics`、`policy` 与已批准设计不一致，本计划**删除**对这些旧路径的依赖。 |
| **PAT 系统（实现计划）** | 见 **`backend-saas-service/plan/2026-04-01-pat-system-mcp-prerequisite.md`**。交付表 + `/api/v1/pats`（JWT）+ Bearer `pat_...` 中间件 + scope + `X-Workspace-Id` 与 PAT 绑定工作区 **403**（§3.5）。 |
| **管理者工具后端** | 在 PAT 计划 Task 7 挂载 scope 后，`GET /api/v1/models`、`/analytics/*`、`/virtual-keys`、`/agents`、`/departments`、`/subscriptions/current`、`/policies/budget-control` 等须在 PAT + 正确 scope 下可用；路径以 `backend-saas-service` `internal/api/routes/routes.go` 为准。**注意：** `/workspaces/*`（含 `/:id/stats`）与 `/logs` 当前为 **JWT-only**，MCP 不依赖前者作 overview，本计划**不提供** `get_request_logs`。 |
| **npm 包名** | §5.9 要求迁移至 `@alephant/mcp`；可与 `plan/2026-04-01-track1-npm-distribution.md` **合并提交**或在本计划 Task 末统一 `package.json`，避免两次改名冲突。 |

**推荐并行顺序：** Cockpit 与 PAT 两份后端计划 **可同时开工**；MCP 双模式（本文件）宜在两端 **最小可用**（Cockpit：health+scope+usage-summary；PAT：发 token + 一条受 scope 保护的 GET）之后再做端到端联调。

**Git 与工作目录：** 计划在路径上写 `alephant-mcp/...` 是为了父仓可读性。若你在 **`alephant-mcp` 仓库根目录**内开发（含作为 git submodule 检出时），`git add` / `git commit` 应使用**不带** `alephant-mcp/` 前缀的路径（例如 `git add src/auth package.json vitest.config.ts`）。父仓聚合提交时再在父仓 `git add alephant-mcp` 更新 submodule 指针。

**与旧实现的差异（刻意行为）：**

- 移除 `useRealApi()` Mock 分支与 `apply_cost_policy` 工具（§7 后续扩展）；`cost_audit_report` Prompt 改为引导调用 §5.3 列出的新工具名。
- VK 模式 **仅** Bearer `Authorization: Bearer <vk>`（§2.1）；若当前代码仍发 `X-Alephant-Virtual-Key`，在 `CockpitClient` 中**删除**该头，除非后端仍强制要求（以联调为准，设计倾向单头）。

---

## 文件清单（§5.1 对齐）

| 操作 | 路径 | 职责 |
|------|------|------|
| Create | `alephant-mcp/src/auth/types.ts` | `AuthMode`、`AuthEnvConfig` |
| Create | `alephant-mcp/src/auth/detector.ts` | `detectAuthMode`：PAT 优先；凭证缺失 **throw**（`index.ts` 捕获后 stderr + `process.exit(1)`） |
| Create | `alephant-mcp/src/config/env.ts` | 集中读取 `ALEPHANT_*`（base URL、VK、PAT、WORKSPACE_ID、RATE_LIMIT_RPM） |
| Modify / Replace | `alephant-mcp/src/config.ts` | 合并入 `env.ts` 或 re-export，避免双源 |
| Create | `alephant-mcp/src/utils/rate-limiter.ts` | §5.8 `RateLimiter` + `globalRateLimiter` |
| Create | `alephant-mcp/src/utils/safe-call.ts` | `safeCall`：限流 → try/catch → §5.4 映射；`mode: 'vk' \| 'manager'` |
| Create | `alephant-mcp/src/clients/base-client.ts` | **定稿：** 仅创建 axios 实例、`baseURL`、超时、通用 response 拦截；**不在 client 层调用** `globalRateLimiter.acquire` — 限流 **唯一入口**为 `safeCall` 首行（与 Task 3 一致，避免双重 acquire） |
| Create | `alephant-mcp/src/clients/cockpit-client.ts` | VK：`GET .../cockpit/*` 方法签名与 §4.5 JSON 类型 |
| Create | `alephant-mcp/src/clients/manager-client.ts` | PAT：`Authorization: Bearer <pat>` + `X-Workspace-Id: <uuid>`（或项目既有 workspace 头名，与 SaaS 一致） |
| Create | `alephant-mcp/src/tools/registry.ts` | `registerTools(server, mode, deps)` |
| Create | `alephant-mcp/src/tools/shared/usage.ts` | `get_usage_summary`、`get_daily_costs`、`get_cost_by_model` |
| Create | `alephant-mcp/src/tools/shared/models.ts` | `list_available_models` |
| Create | `alephant-mcp/src/tools/vk/scope.ts` | `get_my_scope` |
| Create | `alephant-mcp/src/tools/vk/budget.ts` | `get_my_budget`、`get_my_recent_requests` |
| Create | `alephant-mcp/src/tools/manager/keys.ts` | virtual keys CRUD 工具 |
| Create | `alephant-mcp/src/tools/manager/analytics.ts` | `get_workspace_overview`（仅；**不**含 `get_request_logs`，本迭代不提供） |
| Create | `alephant-mcp/src/tools/manager/agents.ts` | `list_agents`、`get_agent_analytics` |
| Create | `alephant-mcp/src/tools/manager/departments.ts` | `list_departments`、`get_department_analytics` |
| Create | `alephant-mcp/src/tools/manager/policies.ts` | `get_subscription_info`、`set_budget_policy` |
| Create | `alephant-mcp/src/prompts/cost-audit.ts` | 注册 `cost_audit_report`（双模式文案分支） |
| Create | `alephant-mcp/src/prompts/optimization.ts` | 注册 `cost_optimization`（仅 manager） |
| Create | `alephant-mcp/src/resources/model-catalog.ts` | 读 `data/model-catalog.json` 注册 resource |
| Create | `alephant-mcp/data/model-catalog.json` | 初始可为 `[]` 或最小示例，后续人工扩充 |
| Replace | `alephant-mcp/src/index.ts` | 薄入口：检测模式、建 client、register、stdio |
| Delete 或弃用 | `alephant-mcp/src/client.ts` | 逻辑迁入 `clients/cockpit-client.ts` 后删除 |
| Create | `alephant-mcp/src/types/api.ts` | 与 Cockpit/Manager 响应共用的 TS 类型（可选拆分） |
| Modify | `alephant-mcp/package.json` | `test` 脚本、`vitest` devDependency |
| Create | `alephant-mcp/vitest.config.ts` | ESM 与 `src/**/*.test.ts` |
| Create | `alephant-mcp/src/auth/detector.test.ts` | 见 Task 1 |
| Create | `alephant-mcp/src/utils/rate-limiter.test.ts` | 见 Task 2 |
| Modify | `alephant-mcp/README.md` | 双模式 env 示例（§5.7）、工具列表、移除 Mock 说明 |

---

### Task 1: Auth 检测与启动失败路径

**Files:**
- Create: `alephant-mcp/src/auth/types.ts`
- Create: `alephant-mcp/src/auth/detector.ts`
- Create: `alephant-mcp/src/auth/detector.test.ts`
- Create: `alephant-mcp/src/config/env.ts`（若与 Task 1 同步引入最小字段）
- Create: `alephant-mcp/vitest.config.ts`（**本 Task 内必须创建**，与最后一步 `git add` 一致；ESM、`environment: node`、`include: src/**/*.test.ts`）

**硬性约定：** `detectAuthMode` **只抛 `Error`（或自定义错误）**，**禁止**在 detector 内调用 `process.exit`。`index.ts` 顶层 `try/catch` 捕获后打印 stderr 再 `process.exit(1)`。

- [ ] **Step 1: 创建 `vitest.config.ts` 并安装依赖**

```bash
cd alephant-mcp && npm install -D vitest
```

新建 `vitest.config.ts`（示例）：

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

在 `package.json` 增加：`"test": "vitest run"`。

- [ ] **Step 2: 编写失败用例（无凭证 + manager 缺 workspace）**

```typescript
// src/auth/detector.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { detectAuthMode } from "./detector.js";

describe("detectAuthMode", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("throws when neither VK nor PAT", () => {
    delete process.env.ALEPHANT_VIRTUAL_KEY;
    delete process.env.ALEPHANT_PAT;
    expect(() => detectAuthMode(process.env)).toThrow(/credential|auth|missing/i);
  });

  it("throws when PAT set but ALEPHANT_WORKSPACE_ID missing", () => {
    process.env.ALEPHANT_PAT = "pat_wsabc_e4b7d9f1c0a53e8b0000000000000000000000000000000000000000000000";
    delete process.env.ALEPHANT_WORKSPACE_ID;
    delete process.env.ALEPHANT_VIRTUAL_KEY;
    expect(() => detectAuthMode(process.env)).toThrow(/workspace/i);
  });
});
```

- [ ] **Step 3: 运行测试确认 RED**

```bash
cd alephant-mcp && npx vitest run src/auth/detector.test.ts
```

预期：失败（函数未实现或未抛错）。

- [ ] **Step 4: 实现 `detectAuthMode`**

规则（§2.1）：若存在 `ALEPHANT_PAT`（非空 trim）→ 先校验 `ALEPHANT_WORKSPACE_ID` 非空，否则 **throw**；返回 `'manager'`。否则若存在 `ALEPHANT_VIRTUAL_KEY` → `'vk'`。否则 **throw**（消息含缺少凭证说明）。

- [ ] **Step 5: 运行测试 GREEN**

```bash
# 在父仓根目录时：
cd alephant-mcp && npx vitest run src/auth/detector.test.ts

# 在 alephant-mcp 子仓根目录时：
npx vitest run src/auth/detector.test.ts
```

预期：PASS。

- [ ] **Step 6: Commit**（在 **`alephant-mcp` 仓库根**执行时路径无 `alephant-mcp/` 前缀）

```bash
# 在父仓根目录时：
git add alephant-mcp/src/auth alephant-mcp/src/config/env.ts alephant-mcp/package.json alephant-mcp/package-lock.json alephant-mcp/vitest.config.ts

# 在 alephant-mcp 子仓根目录时：
git add src/auth src/config/env.ts package.json package-lock.json vitest.config.ts

git commit -m "feat(mcp): add auth mode detection and env helpers"
```

---

### Task 2: 令牌桶限流器

**Files:**
- Create: `alephant-mcp/src/utils/rate-limiter.ts`
- Create: `alephant-mcp/src/utils/rate-limiter.test.ts`

- [ ] **Step 1: 编写测试 `ALEPHANT_RATE_LIMIT_RPM=0` 立即通过**

```typescript
it("rpm 0 skips waiting", async () => {
  const lim = new RateLimiter(0);
  const t0 = Date.now();
  await lim.acquire();
  await lim.acquire();
  expect(Date.now() - t0).toBeLessThan(50);
});
```

- [ ] **Step 2: RED → 实现 §5.8**（`refill`、`acquire` 队列等待）

- [ ] **Step 3: GREEN** `npx vitest run src/utils/rate-limiter.test.ts`

- [ ] **Step 4: Commit** `feat(mcp): add token-bucket rate limiter`

---

### Task 3: `safeCall` 与 HTTP 错误类型

**Files:**
- Create: `alephant-mcp/src/utils/safe-call.ts`
- Create: `alephant-mcp/src/clients/base-client.ts`（本 Task 内创建；见文件清单「定稿」：`base-client` 无 `acquire`，仅 axios 配置）

- [ ] **Step 1: 定义 `HttpLikeError`**：`status?: number`、`headers?: Record<string,string>`、`code?: string`、`message`

- [ ] **Step 2: 实现 `safeCall(fn, mode)`**：首行 `await globalRateLimiter.acquire()`；成功返回 MCP `content` JSON 字符串。**401**：按 §5.4，`vk` 与 `manager` 使用不同 credential 提示文案。**403**：使用 §5.4 **固定**英文句 `"Permission denied. This operation requires manager mode (PAT) or higher scope."`（勿另写一套 vk/manager 变体）。429/504/500/超时同 §5.4。

- [ ] **Step 3: 单元测试**：mock `fn` 抛 `status: 401` → 文本含 `ALEPHANT_VIRTUAL_KEY` 或 `ALEPHANT_PAT`；`403` → 文本与 §5.4 一致。

- [ ] **Step 4: Commit** `feat(mcp): add safeCall with rate limit and error mapping`

---

### Task 4: CockpitClient（VK）

**Files:**
- Create: `alephant-mcp/src/clients/cockpit-client.ts`
- Delete: `alephant-mcp/src/client.ts`（在 Task 4 末尾，确保无引用）

- [ ] **Step 1: 方法列表**：`health()`（无 Auth）、`scope()`、`usageSummary(period)`、`dailyCosts(period)`、`costByModel(period)`、`budgetStatus()`、`recentRequests(limit)` — URL 前缀 `/api/v1/cockpit`，query 与 §4.5 一致。**不包含** `GET /models`（§5.3 共享工具走 SaaS `/models`，见 Task 6）。

- [ ] **Step 2: 使用 axios**；仅 `Authorization: Bearer <vk>`；`baseURL` 来自 env。

- [ ] **Step 3: TypeScript 类型**：响应含 `degraded`、`data_source` 等顶层字段（可 `interface` + 部分可选）。

- [ ] **Step 4: 手动 smoke**：`curl` 或临时 script（可选，不写入仓库）对 staging 验证 401 无效 VK。

- [ ] **Step 4b（联调核对）：`health()`** — 确认 `GET /api/v1/cockpit/health` 与 §4.4 一致（通常 **无** `Authorization`）。若 `routes.go` / 全局中间件要求鉴权导致 401，在 Task 11「路径更正表」记一行并改 client 实现（与设计评审同步）。

- [ ] **Step 5: Commit** `feat(mcp): add Cockpit HTTP client for VK mode`

---

### Task 5: ManagerClient（PAT）

**Files:**
- Create: `alephant-mcp/src/clients/manager-client.ts`

- [ ] **Step 1: 构造函数接收** `baseUrl`, `pat`, `workspaceId`。

- [ ] **Step 2: 默认头**：`Authorization: Bearer <pat>`；Workspace 头名称与 `backend-saas-service` 现有 JWT 流一致（常见为 `X-Workspace-Id`，以代码搜索为准）。

- [ ] **Step 3: 封装方法**：`getWorkspaceOverview()` → **`GET /api/v1/analytics/overview`**（PAT + `X-Workspace-Id`；**不要**用 `GET /api/v1/workspaces/:id/stats`，该路由为 JWT-only）。同理封装 `getAnalyticsCosts` / `getAnalyticsUsage` 等（与共享工具 `period` 映射一致时复用同一 client 方法）。**不包含** `getLogs`：本计划不提供 `get_request_logs`。其余：`listVirtualKeys`、`createVirtualKey`、`patchVirtualKeyBudget`、`revokeVirtualKey`、`listAgents`、`getAgentAnalytics`、`listDepartments`、`getDepartmentAnalytics`、`getSubscriptionCurrent`、`putBudgetPolicy`——**以 `routes.go` grep 为准**。

- [ ] **Step 4: Commit** `feat(mcp): add manager API client for PAT mode`

---

### Task 6: 工具注册表与共享工具

**Files:**
- Create: `alephant-mcp/src/tools/registry.ts`
- Create: `alephant-mcp/src/tools/shared/usage.ts`
- Create: `alephant-mcp/src/tools/shared/models.ts`

- [ ] **Step 1: `registerTools`**：`vk` 注册 4 共享 + 3 VK 专属；`manager` 注册 4 共享 + **11** 管理者（**不含** `get_request_logs`）；其余工具名与 §5.3 **完全一致**（snake_case），**除**已移除项。

- [ ] **Step 2: 共享工具实现**：`get_usage_summary` / `get_daily_costs` / `get_cost_by_model` — VK 分支仅调 `cockpitClient` 对应 §4.4 端点；manager 分支调 `managerClient` 的 analytics 封装（参数 `period` 枚举与设计一致：`24h|7d|30d|billing_cycle` 等）。

- [ ] **Step 3: `list_available_models`（易错点）**：§5.3 写明 VK 与管理者后端均为 **`/models`**（即 `GET {baseURL}/api/v1/models` 或 grep 得到的真实路径），**不是** `/api/v1/cockpit/*`。**定稿实现：** 在 `src/tools/shared/models.ts` 使用独立请求函数（可复用 `base-client`），VK 与 manager 分别按各自认证头调用同一路径；**不要**把该方法并入 `CockpitClient` 的 `/cockpit/*` 方法集。**禁止**写成 `GET /api/v1/cockpit/models`。manager 模式若 SaaS 要求 workspace 头，与 `ManagerClient` 默认头一致。

- [ ] **Step 4: Commit** `feat(mcp): register shared and mode-specific tools`

---

### Task 7: 管理者与 VK 专属工具文件拆分

**Files:**
- Create: `alephant-mcp/src/tools/vk/scope.ts`, `budget.ts`
- Create: `alephant-mcp/src/tools/manager/*.ts`（keys, analytics, agents, departments, policies）

- [ ] **Step 1: 每个工具**：`zod` 入参 schema + `describe`；handler 内 `return safeCall(() => client.xxx(), mode)`。

- [ ] **Step 2: `get_my_recent_requests`**：`limit` 1–100，默认 20（§5.3）。

- [ ] **Step 3: `create_virtual_key` 等**：字段校验与设计表格一致。

- [ ] **Step 4: Commit** `feat(mcp): add vk and manager tool modules (zod + safeCall)`（说明：18 个工具名与注册在 Task 6 已完成；本 Task 为按文件拆分与入参校验落地。）

---

### Task 8: Prompts 与 Resources

**Files:**
- Create: `alephant-mcp/src/prompts/cost-audit.ts`
- Create: `alephant-mcp/src/prompts/optimization.ts`
- Create: `alephant-mcp/src/resources/model-catalog.ts`
- Create: `alephant-mcp/data/model-catalog.json`
- Create: `alephant-mcp/src/prompts/register.ts`、`alephant-mcp/src/resources/register.ts` — 导出 `registerPrompts(server, mode)`、`registerResources(server)`（或等价命名），**避免** `index.ts` 堆叠具体 `server.prompt` / `server.resource` 注册细节。

- [ ] **Step 1: `cost_audit_report`**：指导调用 `get_usage_summary`、`get_daily_costs`、`get_cost_by_model`、VK 时加 `get_my_budget` 等（§5.5）。

- [ ] **Step 2: `cost_optimization`**：仅 `manager` 模式注册（§5.5）。**勿**在文案中引导调用 `get_request_logs`（本迭代未提供该工具）。

- [ ] **Step 3: Resource `model-catalog`**：`listResources` / `readResource` 返回静态 JSON（路径 `data/model-catalog.json`）。

- [ ] **Step 4: Commit** `feat(mcp): add prompts and model-catalog resource`

---

### Task 9: 入口 `index.ts` 与 CLI `--audit`

**Files:**
- Replace: `alephant-mcp/src/index.ts`

- [ ] **Step 1:** `detectAuthMode` → 创建对应 client → `registerTools` + `registerPrompts` / `registerResources`（见 Task 8 新增注册文件）→ `StdioServerTransport`。

- [ ] **Step 2:** 移除所有 Mock 分支；版本号与 `package.json` 对齐。

- [ ] **Step 3:** `--audit`：VK 模式调用 `cockpit/scope` + `usage-summary` 打印一行摘要；manager 模式打印 workspace id + **`GET /api/v1/analytics/overview`**（经 `get_workspace_overview` / `ManagerClient`；若失败打印错误）。

- [ ] **Step 4: Build**

```bash
cd alephant-mcp && npm run build
```

预期：`dist/` 无 tsc 错误。

- [ ] **Step 5: Commit** `feat(mcp): wire dual-mode server entrypoint`

---

### Task 10: README、package 元数据、与 Track1 对齐

**Files:**
- Modify: `alephant-mcp/README.md`
- Modify: `alephant-mcp/package.json`（与 `plan/2026-04-01-track1-npm-distribution.md` 协调版本号）

- [ ] **Step 1:** README 中给出 §5.7 两段 JSON；说明多工作区多 `mcpServers` 条目（§5.7）。

- [ ] **Step 2:** `keywords`、`description`、`repository` 按 §5.9。

- [ ] **Step 3: Commit** `docs(mcp): dual-mode README and package metadata`

---

### Task 11: 全量测试与 MCP Inspector 手测

- [ ] **Step 1:** `npx vitest run`

- [ ] **Step 2:** 使用 `@modelcontextprotocol/inspector` 或 Cursor MCP 对 VK / PAT 各跑一遍 §6.3 中与 MCP 相关的子集（401/403/429 依赖后端，可标记为联调项）。

- [ ] **Step 3:** 在计划文末「后端路径更正表」或独立 issue 记录与 §5.3 不一致项（`routes.go` grep 结果为准）。

- [ ] **Step 4（联调核对）：VK + `GET /api/v1/models`** — 仅用 `Authorization: Bearer <vk>`（无 `X-Workspace-Id`）能否 200；若中间件要求 workspace 头，在「路径更正表」注明并在 `list_available_models` 实现中补齐（与 Task 6 选项 (a)/(b) 一致）。

---

## 后端路径更正表（实现时填写）

| 设计/计划中的路径或假设 | `routes.go` / 实测结论 | MCP 代码调整 |
|-------------------------|-------------------------|--------------|
| （示例）`/api/v1/cockpit/health` 无 Auth | 若需 Auth → | `health()` 补头或改文档 |
| （示例）VK 访问 `/api/v1/models` | 若 403 → | 补头或走 BFF |

---

## 执行交接

计划已保存至 `alephant-mcp/plan/2026-04-01-mcp-dual-mode-implementation.md`。

**说明：** 开发线 A/B 的后端实现计划已落盘：**`backend-saas-service/plan/2026-04-01-pat-system-mcp-prerequisite.md`**、**`backend-saas-service/plan/2026-04-01-cockpit-api-mcp-prerequisite.md`**。本文件仅覆盖 **alephant-mcp**（开发线 C）。前端 PAT 面板（§3.5）若需计划，另写 **`Alephantinterface/plan/YYYY-MM-DD-...md`**，不在此包内。

**两种执行方式：**

1. **Subagent-Driven（推荐）** — 每 Task 派生子代理，任务间人工复核；技能：`@superpowers:subagent-driven-development`。
2. **Inline Execution** — 本会话批量执行 + 检查点；技能：`@superpowers:executing-plans`。

**需要我选择哪一种？**（若你未回复，默认按 Task 顺序自行实现时以 Subagent-Driven 为推荐。）

---

## 参考技能

- `@writing-plans` — 计划结构
- `@verification-before-completion` — 声称完成前须跑 `vitest` + `npm run build`
- `alephant-mcp/docs/2026-03-31-alephant-mcp-dual-mode-design.md` — 权威契约

---

## 计划评审记录（2026-04-01）

子代理对照 `docs/2026-03-31-alephant-mcp-dual-mode-design.md` §5 完成首轮评审：**Issues Found**，已在本文档修订。

**修订摘要：** Task 1 增补 `vitest.config.ts` 创建步骤与 Step 6 Commit、`detectAuthMode` 仅 throw（`exit` 仅限 `index.ts`）、PAT 缺 `ALEPHANT_WORKSPACE_ID` 单测；Architecture 标明 `index` 承担 §5.1 `server.ts` 职责、`list_available_models` 非 cockpit；Task 4 明确 CockpitClient **不含** `GET /models`；Task 6 写死 `list_available_models` 须 `GET /api/v1/models`（禁止 `/cockpit/models`）；Task 3 的 **403** 与 §5.4 **单一**英文句对齐；`smithery.yaml` 交叉引用 `plan/2026-04-01-track1-npm-distribution.md`。

**当前状态：** 可开工（修订后的计划无阻塞性缺口；实现时仍以 SaaS 真实路由 grep 为准）。

**2026-04-01 二次修订（与 `backend-saas-service` 路由对齐）：** `get_workspace_overview` → `GET /api/v1/analytics/overview`（PAT 可用）；**暂不提供** `get_request_logs`（`/logs` 为 JWT-only）；工具总数 **18**（与 `docs/2026-03-31-alephant-mcp-dual-mode-design.md` §5.3 一致）。

**2026-04-01 三次修订（计划可执行性）：** 增补 **Git 与子仓路径**说明；文件清单与 Task 3 **定稿**「限流仅在 `safeCall`」、`base-client` 本 Task 创建；Task 4 **health 联调核对**；Task 7 commit 文案与 Task 6 职责区分；Task 8/9 **prompts/resources barrel**；Task 11 **VK + `/models` 联调**；新增文末 **后端路径更正表**模板。

**2026-04-01 四次修订（最终一致性）：** Task 6 `list_available_models` 实现收敛为 **shared 独立请求函数**（不并入 `CockpitClient` `/cockpit/*` 方法集）；Task 8 将 `prompts/register.ts` 与 `resources/register.ts` 从“推荐”提升为“必建”；Task 9 同步改为调用上述注册入口，消除“推荐/必选”表述分叉。
