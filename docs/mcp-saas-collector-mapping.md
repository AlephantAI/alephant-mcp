# MCP → SaaS API → Collector 对照表

本文档描述 **`@gengbingbing/alephant-mcp`**（`alephant-mcp` 源码）在两种认证模式下，MCP 工具与 **SaaS（`backend-saas-service`）**、**Collector 分析服务** 的对应关系。

- **Base URL（SaaS）**：环境变量 `ALEPHANT_API_BASE_URL`（例如 `https://alephant.io`）。
- **Collector**：SaaS 通过 `COLLECTOR_ANALYTICS_BASE_URL` 转发；Collector 路径均以 **`/v1/analytics/...`** 为前缀（与 `internal/client/collector_analytics.go` 一致）。MCP 客户端不直连 `analytics.alephant.io`。

实现参考：

- MCP：`src/clients/cockpit-client.ts`、`src/clients/manager-client.ts`、`src/tools/**/*.ts`
- SaaS：`internal/api/handlers/cockpit/`、`internal/api/handlers/observability/`、`internal/service/analytics_service.go`、`internal/service/cockpit_service.go`、`internal/client/collector_analytics.go`

---

## 1. Virtual Key（VK / Cockpit）模式

认证：**`Authorization: Bearer vk-...`**，**无** `X-Workspace-Id`（工作区由 VK 解析）。

| MCP 工具 | SaaS API | Collector（相对 `COLLECTOR_ANALYTICS_BASE_URL`） | 说明 |
|----------|----------|--------------------------------------------------|------|
| `get_my_scope` | `GET /api/v1/cockpit/scope` | — | PG：工作区、VK、绑定实体等 |
| `get_usage_summary` | `GET /api/v1/cockpit/usage-summary?period=…` | `GET /v1/analytics/saas/usage?dateFrom&dateTo&agentId\|memberId` | `GetSaasUsageScoped` |
| `get_daily_costs` | `GET /api/v1/cockpit/daily-costs?period=…` | 同上 | 日序列来自同一 `usage` 响应 |
| `get_cost_by_model` | `GET /api/v1/cockpit/cost-by-model?period=…` | `GET /v1/analytics/saas/models?dateFrom&dateTo&agentId\|memberId` | `GetSaasModelsScoped` |
| `get_my_budget` | `GET /api/v1/cockpit/budget-status?period=…` | `GET /v1/analytics/saas/usage?…`（用于 **spent** 聚合） | 预算额度/动作等来自 **PG**（`virtual_keys` 等） |
| `get_my_recent_requests` | `GET /api/v1/cockpit/recent-requests` | — | **占位**：当前返回空列表，未接日志后端 |
| `list_available_models` | `GET /api/v1/models` | — | 模型目录（非 Cockpit 前缀） |
| （非 MCP 工具）健康探活 | `GET /api/v1/cockpit/health` | 探活请求：`GET /v1/analytics/saas/sparklines?metrics=spend` | 用于检测 Collector 可达性；请求头与常规 VK 业务不同 |

---

## 2. PAT（Manager）模式

认证：**`Authorization: Bearer pat_...`** + **`X-Workspace-Id: <uuid>`**（见 `ManagerClient`）。

### 2.1 共享工具（VK / PAT 同名；PAT 走右侧 SaaS）

| MCP 工具 | SaaS（PAT） | Collector |
|----------|-------------|-----------|
| `get_usage_summary` | **`GET /api/v1/analytics/costs`**（`dateFrom`/`dateTo` 由 MCP `period` 映射） | 并行：`GET /v1/analytics/saas/costs`；`GET /v1/analytics/by-member?…&limit=200`；`GET /v1/analytics/departments/cost-breakdown`（失败仅影响部分富化） |
| `get_daily_costs` | `GET /api/v1/analytics/usage` | `GET /v1/analytics/saas/usage` |
| `get_cost_by_model` | `GET /api/v1/analytics/models` | `GET /v1/analytics/saas/costs`（取 **model** 维度；无单独 `/saas/models` 调用） |
| `list_available_models` | `GET /api/v1/models` | — |

**注意**：PAT 下 `get_usage_summary` 对应 **`/analytics/costs`**，**不是** `GET /analytics/overview`；与 VK 走 Cockpit `usage-summary` 不同（见 `src/tools/shared/usage.ts`）。

### 2.2 管理者专属工具

| MCP 工具 | SaaS（PAT） | Collector |
|----------|-------------|-----------|
| `get_workspace_overview` | `GET /api/v1/analytics/overview` | `GET /v1/analytics/saas/overview`；可能再调 `GET /v1/analytics/saas/usage` 补全 KPI（`GetOverview`） |
| `list_virtual_keys` | `GET /api/v1/virtual-keys` | 列表富化：`GET /v1/analytics/saas/costs` + `GET /v1/analytics/by-member` + `GET /v1/analytics/by-agent`（日期为订阅周期） |
| `create_virtual_key` | `POST /api/v1/virtual-keys` | — |
| `update_key_budget` | `PATCH /api/v1/virtual-keys/{id}` | — |
| `revoke_virtual_key` | `POST /api/v1/virtual-keys/{id}/revoke` | — |
| `list_agents` | `GET /api/v1/agents` | 富化：`GET /v1/analytics/agents/cost-breakdown`（无 query，默认窗口） |
| `get_agent_analytics` | `GET /api/v1/agents/{id}/analytics?days=…` | `GET /v1/analytics/by-agent?dateFrom&dateTo&limit=500` |
| `list_departments` | `GET /api/v1/departments` | 富化：`GET /v1/analytics/departments/cost-breakdown`（`dateFrom`/`dateTo` 为空则用 Collector 默认窗口） |
| `get_department_analytics` | `GET /api/v1/departments/{id}/analytics` | — | **当前占位**：Spend/Requests/Tokens 为 0 |
| `get_subscription_info` | `GET /api/v1/subscriptions/current` | — |
| `set_budget_policy` | `GET` + `PUT /api/v1/policies/budget-control` | — |

---

## 3. SaaS 有路由、但 MCP 未暴露的分析接口（便于对照前端/自建客户端）

| SaaS | Collector |
|------|-----------|
| `GET /api/v1/analytics/efficiency` | 无（占位实现） |
| `GET /api/v1/analytics/budget-status` | 无（占位实现） |
| `GET /api/v1/analytics/sparklines` | `GET /v1/analytics/saas/usage`（最近 7 天） |
| `GET /api/v1/analytics/usage-history` | `GET /v1/analytics/saas/usage`（再按月聚合） |
| `GET /api/v1/subscriptions/log-usage` | `GET /v1/analytics/saas/overview`（计费周期内 `totalRequests`） |

---

## 4. Collector 路径速查（按路径聚合）

| Collector 路径 | 常见触发场景 |
|----------------|----------------|
| `/v1/analytics/saas/overview` | `analytics/overview`；`subscriptions/log-usage` |
| `/v1/analytics/saas/usage` | `analytics/usage`、`analytics/overview`（补全）、`analytics/sparklines`、`analytics/usage-history`；Cockpit `usage-summary` / `daily-costs` / `budget-status`（spent） |
| `/v1/analytics/saas/costs` | `analytics/costs`、`analytics/models`（按 model 维度）、虚拟密钥列表富化 |
| `/v1/analytics/saas/models` | 仅 **Cockpit** `cost-by-model`（`GetSaasModelsScoped`） |
| `/v1/analytics/by-member` | `analytics/costs`、虚拟密钥列表富化 |
| `/v1/analytics/by-agent` | `agents/{id}/analytics`、虚拟密钥列表富化 |
| `/v1/analytics/departments/cost-breakdown` | `analytics/costs`（并行）、`departments` 列表富化 |
| `/v1/analytics/members/cost-breakdown` | `GET /api/v1/members` 列表富化（**MCP 无对应工具**） |
| `/v1/analytics/agents/cost-breakdown` | `GET /api/v1/agents` 列表富化（`list_agents`） |
| `/v1/analytics/saas/sparklines` | `GET /api/v1/cockpit/health` 中 Collector 探活（非标准 VK 业务请求） |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-04-02 | 初稿：VK / PAT 对照表与 Collector 速查。 |
