# Alephant MCP Server — 双模式架构设计

**日期**: 2026-03-31  
**修订**: 2026-04-01（基于 design-review 补充契约细节）；2026-04-01（多 PAT / 多工作区 MCP 配置；VK 鉴权与限流关系澄清）  
**状态**: 已批准  
**范围**: alephant-mcp + backend-saas-service + Alephantinterface  

---

## 1. 概述

为 Alephant BYO-KEY 平台构建 MCP（Model Context Protocol）Server，使开发者和管理者能在 Cursor、Claude Desktop、VS Code Copilot 等 AI 工具中通过自然语言查询 AI 支出、管理密钥和策略。

> **与旧版 PRD 的关系**：本文档取代 `alephant-mcp/docs/alephant-mcp-prd.md`（2026-02-28 单模式设计）。旧 PRD 定义 12 个工具（单模式），本设计扩展为 19 个工具（双模式：4 共享 + 3 VK 模式专属 + 12 管理者专属）。旧 PRD 保留作历史参考，实现以本文档为准。

### 1.1 核心决策

| 决策项 | 结论 |
|--------|------|
| 目标用户 | VK 持有者/开发者（VK 模式）+ 管理者/Admin（PAT 模式），双模式 |
| 管理者认证 | 第一阶段 Personal Access Token（PAT），后续加 OAuth 2.1 Device Flow |
| VK 持有者认证 | Virtual Key（现有凭证） |
| Cockpit API | 不存在，需在 backend-saas-service 中新建 |
| 项目范围 | 全包：MCP Server + 后端 PAT + 后端 Cockpit API + 前端 PAT 面板 |
| 构建策略 | 并行开发三条线（PAT 系统 / Cockpit API / MCP Server） |
| 传输协议 | 第一阶段 Stdio（npm 分发），后续加 Streamable HTTP |
| 共享工具管理者后端 | 复用现有 `/api/v1/analytics/*` 端点（PAT 认证后直接调用） |

### 1.2 设计目标

- 开发者在 IDE 内即时获取 FinOps 数据，无需切换浏览器
- 管理者可通过 AI 助手完成密钥管理和策略配置
- 三条开发线可独立并行，通过 API 契约解耦
- 渐进式交付：每个阶段都有可用产品

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  MCP 宿主 (Cursor / Claude Desktop / VS Code Copilot)       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              alephant-mcp (MCP Server)                │  │
│  │                                                       │  │
│  │  ┌─────────────┐    ┌──────────────────────────────┐  │  │
│  │  │ AuthDetector │───▶│ Mode Router                  │  │  │
│  │  │ (VK or PAT)  │    │                              │  │  │
│  │  └─────────────┘    │  ┌──────┐    ┌───────────┐   │  │  │
│  │                     │  │  VK  │    │  Manager   │   │  │  │
│  │                     │  │Tools │    │  Tools     │   │  │  │
│  │                     │  │(7)   │    │  (12)      │   │  │  │
│  │                     │  └──┬───┘    └─────┬─────┘   │  │  │
│  │                     └─────┼──────────────┼─────────┘  │  │
│  └───────────────────────────┼──────────────┼────────────┘  │
└──────────────────────────────┼──────────────┼───────────────┘
                               │              │
                    ┌──────────▼──┐    ┌──────▼──────────┐
                    │ Cockpit API │    │  REST API /v1   │
                    │/api/v1/     │    │  + PAT Auth     │
                    │cockpit/*    │    │                 │
                    │(VK-scoped)  │    │(PAT→JWT bridge) │
                    └──────┬──────┘    └────────┬────────┘
                           │                    │
                    ┌──────▼────────────────────▼────────┐
                    │     backend-saas-service (Go/Gin)   │
                    │  ┌───────────┐  ┌───────────────┐  │
                    │  │ Cockpit   │  │ Existing API  │  │
                    │  │ Handler   │  │ Handlers      │  │
                    │  │ (new)     │  │ (100+ routes) │  │
                    │  └─────┬─────┘  └───────┬───────┘  │
                    │        │                │          │
                    │  ┌─────▼────────────────▼───────┐  │
                    │  │   PostgreSQL + Collector      │  │
                    │  └──────────────────────────────┘  │
                    └────────────────────────────────────┘
```

### 2.1 模式识别

MCP 启动时通过环境变量判断运行模式：

| 环境变量 | 值格式 | 模式 | 后端认证头 |
|---------|--------|------|-----------|
| `ALEPHANT_VIRTUAL_KEY` | `vk-xxx...` | VK 模式 | `Authorization: Bearer <vk>` |
| `ALEPHANT_PAT` | `pat_xxx...` | 管理者模式 | `Authorization: Bearer <pat>` |
| 两者都提供 | — | 管理者模式（PAT 优先） | `Authorization: Bearer <pat>` |
| 都不提供 | — | 报错退出（缺少认证凭证） | — |

> **关于认证头简化**：当前 backend-saas-service 中间件已通过 token 前缀（`vk-`）自动区分 VK 与 JWT，只需 `Authorization: Bearer <vk>` 一个头即可，无需额外辅助头。

**VK 凭证与鉴权（澄清）**：Virtual Key 在传输形态上是一段字符串，与常见 API Key 相同；**鉴权发生在服务端**：对 Bearer 值做哈希后在 `virtual_keys` 中校验存在性、`active` 状态与删除标记，并将 `workspace_id` / `entity_*` 注入请求上下文。客户端侧限流（见 §5.8）用于平滑调用、降低 429 与滥用面，**不**构成「用限流代替鉴权」——无效或过期的 VK 仍应在服务端被拒绝（401）。

### 2.2 三条并行开发线

| 开发线 | 工程 | 交付物 | 依赖 |
|--------|------|--------|------|
| **A: PAT 系统** | backend-saas-service + Alephantinterface | PAT 表 + CRUD API + 认证中间件 + 前端管理面板 | 无 |
| **B: Cockpit API** | backend-saas-service | VK-scoped 只读 API（scope/usage/budget） | 无 |
| **C: MCP Server** | alephant-mcp | 双模式框架 + 全部工具定义 + API Client | 依赖 A、B 的接口契约（不依赖实现） |

三条线在开工前先敲定 API 契约（本文档 §3 / §4 / §5），然后各自独立开发、契约联调，最后集成测试。**注：不使用 Mock Client**，MCP Server 直接对接真实后端 API。

---

## 3. PAT 系统设计（开发线 A）

### 3.1 数据库表

```sql
CREATE TABLE personal_access_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  token_hash      VARCHAR(64) NOT NULL,
  token_prefix    VARCHAR(12) NOT NULL,
  scopes          TEXT[] NOT NULL DEFAULT '{"read"}',
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_pat_hash UNIQUE (token_hash)
);

CREATE INDEX idx_pat_user ON personal_access_tokens (user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_pat_hash_active ON personal_access_tokens (token_hash) WHERE revoked_at IS NULL;
```

要点：
- Token 明文**只在创建时返回一次**，存库的是 SHA-256 哈希
- `scopes` 控制权限粒度：`read`（只读分析/列表）、`write`（创建/修改密钥等）、`admin`（策略/设置）
- 一个 PAT 绑定**一个工作区**（用户有多个工作区则需多个 PAT）
- `expires_at` 为 `NULL` 时表示**永不过期**

### 3.2 Token 格式

```
pat_ws<workspace-slug-hash-6chars>_<32-bytes-random-hex>

示例: pat_wsa3f8c2_e4b7d9f1c0a53e8b...（共 ~78 字符）
```

**slug-hash 计算规范：**

```
workspace-slug-hash = lowercase(SHA256(normalized_slug)[0:6])
normalized_slug     = lowercase(workspace_name)
                      → 非字母数字替换为 '-'
                      → 合并连续 '-'
                      → 去除首尾 '-'

示例: "My Workspace" → "my-workspace" → SHA256 → 取前 6 位 hex → "a3f8c2"
```

- `pat_` 前缀 → 一眼识别为 PAT（区别于 `vk-` 虚拟密钥）
- `ws` 段 → 帮助用户识别属于哪个工作区
- 随机段 → 密码学安全随机字节（`crypto/rand`）

### 3.3 后端 API 端点

路由：`/api/v1/pats`，中间件：`RequireAuth` + `RequireWorkspace`（JWT 登录后操作），权限：`owner` / `admin`

> **`workspace_id` 来源**：一律从 JWT 上下文（`X-Workspace-Id` 或 JWT claim）获取，**不从请求体接受**，避免用户指定任意工作区。创建时后端验证 `user_id` 属于目标工作区且具备 `owner`/`admin` 角色。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/pats` | 列出当前工作区的 PATs（分页） |
| POST | `/api/v1/pats` | 创建 PAT（返回明文 token，仅此一次） |
| GET | `/api/v1/pats/:id` | PAT 详情（不含 token 明文） |
| PATCH | `/api/v1/pats/:id` | 更新名称/过期时间 |
| DELETE | `/api/v1/pats/:id` | 撤销 PAT |

**GET /api/v1/pats — 分页列表：**

```json
// GET /api/v1/pats?limit=20&offset=0
// Response (200)
{
  "data": [
    {
      "id": "uuid",
      "name": "MCP Server - Production",
      "token_prefix": "pat_wsa3f8c2",
      "scopes": ["read", "write"],
      "workspace_id": "uuid",
      "last_used_at": "2026-03-31T10:00:00Z",
      "expires_at": "2027-03-31T00:00:00Z",
      "created_at": "2026-04-01T..."
    }
  ],
  "pagination": { "total": 3, "limit": 20, "offset": 0 }
}
```

**POST /api/v1/pats — 创建请求/响应：**

```json
// Request
{
  "name": "MCP Server - Production",
  "scopes": ["read", "write"],
  "expires_at": "2027-03-31T00:00:00Z"
}

// Response (201)
{
  "id": "uuid",
  "name": "MCP Server - Production",
  "token": "pat_wsa3f8c2_e4b7d9f1c0a53e8b...",
  "token_prefix": "pat_wsa3f8c2",
  "scopes": ["read", "write"],
  "workspace_id": "uuid",
  "workspace_name": "My Team",
  "expires_at": "2027-03-31T00:00:00Z",
  "created_at": "2026-04-01T..."
}
```

**GET /api/v1/pats/:id — 详情：**

```json
// Response (200)
{
  "id": "uuid",
  "name": "MCP Server - Production",
  "token_prefix": "pat_wsa3f8c2",
  "scopes": ["read", "write"],
  "workspace_id": "uuid",
  "last_used_at": "2026-03-31T10:00:00Z",
  "expires_at": "2027-03-31T00:00:00Z",
  "created_at": "2026-04-01T..."
}
```

**PATCH /api/v1/pats/:id — 更新：**

```json
// Request（字段均可选）
{
  "name": "Updated Name",
  "expires_at": "2028-03-31T00:00:00Z"
}

// Response (200) — 同 GET /pats/:id 格式
```

**DELETE /api/v1/pats/:id — 撤销：**

```
Response: 204 No Content
```

### 3.4 PAT 认证中间件

在 backend-saas-service 的 auth 中间件中扩展，处理 `Authorization: Bearer pat_xxx` 请求：

1. 检测 Bearer token 前缀是否为 `pat_`
2. SHA-256 哈希后查 `personal_access_tokens` 表
3. 检查：未撤销（`revoked_at IS NULL`）、未过期（`expires_at IS NULL OR expires_at > now()`）
4. 从 PAT 记录获取 `user_id` + `workspace_id`，注入 context（等效于 JWT + X-Workspace-Id）
5. 检查 `scopes` 是否包含当前操作所需的权限
6. 异步更新 `last_used_at`
7. 后续 handler 无需感知是 JWT 还是 PAT

**认证失败错误信息：**

| 场景 | HTTP 状态码 | 错误信息 |
|------|-------------|----------|
| Token 不存在 | 401 | `"Authentication failed"` |
| Token 已撤销 | 401 | `"Token has been revoked"` |
| Token 已过期 | 401 | `"Token has expired"` |
| Scope 不足 | 403 | `"Insufficient permissions. Required scope: <scope>"` |

**Scopes 到操作的映射：**

| Scope | 允许的操作 | 对应端点示例 |
|-------|-----------|-------------|
| `read` | 所有 GET 请求（分析、列表、详情、订阅信息） | GET /analytics/*, GET /virtual-keys, GET /subscriptions/current |
| `write` | 创建、修改、撤销密钥和 Agent | POST /virtual-keys, PATCH /virtual-keys/:id, POST /virtual-keys/:id/revoke |
| `admin` | 策略配置、工作区设置、预算控制 | PUT /policies/*, PATCH /settings/* |

`write` 隐含 `read`，`admin` 隐含 `write` + `read`。

**PAT 自身端点所需最小 Scope：**

| 端点 | 最小 Scope |
|------|-----------|
| GET /pats | read |
| POST /pats | write |
| GET /pats/:id | read |
| PATCH /pats/:id | write |
| DELETE /pats/:id | write |

### 3.5 前端 PAT 管理面板

位置：Settings → API Access（或 Developer Settings）

核心交互：
- 列表展示已有 PATs：名称、前缀、Scopes 标签、最后使用时间、过期状态
- 创建按钮 → 弹窗：填名称、选 Scopes（多选 checkbox）、设过期时间（可选 datepicker）
- 创建成功 → 一次性展示完整 token，带复制按钮 + 警告文案「此 token 不再显示，请立即复制保存」+ MCP 配置 JSON 片段
- 每条 PAT 支持撤销操作（确认弹窗）
- 显示 MCP 配置代码片段（Claude Desktop / Cursor JSON 格式），方便用户直接复制
- **多工作区与 PAT 一一绑定**：数据模型上每条 PAT 记录已绑定唯一 `workspace_id`（§3.1）。用户可在多个工作区分别创建 PAT；`token_prefix` 中含工作区 slug 哈希，便于肉眼区分，**不以前缀参与服务端校验**（校验以哈希查表为准）。

**在 MCP 宿主侧切换工作区（推荐）**：单进程 MCP 配置只有一组环境变量，因此**一个 `mcpServers` 条目对应一个（PAT + workspace）组合**。需要管理多个工作区时，在 Cursor / Claude Desktop 的 `mcpServers` 中注册**多个条目**（例如 `alephant-acme`、`alephant-demo`），每条设置各自的 `ALEPHANT_PAT` 与 `ALEPHANT_WORKSPACE_ID`（须与该 PAT 在控制台创建时所在工作区一致）。用户在对话或工具面板中选择不同 MCP Server 名称即可切换工作区，无需改代码。**实现约束**：管理者模式下，后端应以 PAT 解析出的 `workspace_id` 为权威；若请求携带的 `X-Workspace-Id` / `ALEPHANT_WORKSPACE_ID` 与 PAT 绑定工作区不一致，应 **403**（或等价拒绝），避免误配导致越权观感。

---

## 4. Cockpit API 设计（开发线 B）

### 4.1 设计原则

- 认证凭证：Virtual Key（`Authorization: Bearer vk-xxx`）
- 数据范围：仅限 VK 绑定的实体（agent 或 member）的用量
- 操作类型：全部只读
- 数据源：Collector Analytics API（与现有 analytics 端点一致）
- **数据隔离**：每个 VK 只能查询自己绑定的 entity 数据，无法访问同工作区其他 entity 的数据

### 4.2 VK → Scope 映射

```
VK 认证
  │
  ▼
查 virtual_keys 表（by key_hash, WHERE deleted_at IS NULL AND status = 'active'）
  │
  ├─ entity_type = 'agent'  → scope = 该 Agent 的用量（仅此 Agent）
  ├─ entity_type = 'member' → scope = 该 Member 的用量（仅此 Member）
  └─ entity_type = NULL     → scope = 仅 VK 自身元数据（无分析数据）
  │
  ▼
获取 workspace_id → 可查询该工作区的公共信息（提供商、模型列表）
```

### 4.3 VK 认证中间件

在 backend-saas-service 新增独立的 VK 认证中间件：

1. 检测 Bearer token 前缀 `vk-`
2. SHA-256 哈希后查 `virtual_keys` 表
3. 验证状态：`status = 'active'`，`deleted_at IS NULL`
4. 将 `workspace_id`、`entity_type`、`entity_id`、`master_key_id` 注入 context
5. 异步更新 VK 的 `last_used_at`（需新增迁移：`ALTER TABLE virtual_keys ADD COLUMN last_used_at TIMESTAMPTZ`）

**VK 状态模型：**

| status 值 | 含义 |
|-----------|------|
| `active` | 有效，可认证 |
| `disabled` | 已禁用（人工关闭），认证失败 |
| `expired` | 已过期（超出有效期），认证失败 |

VK 有效条件：`deleted_at IS NULL AND status = 'active'`。已删除的 VK（`deleted_at IS NOT NULL`）不论 status 均无效。

**认证失败统一返回 401**（不区分"不存在"/"已禁用"/"已删除"/"已过期"，避免信息泄露）。

**认证失效及时性**：MCP Server 不缓存 VK 认证状态，每次工具调用均实时通过后端 API 验证，VK 撤销后立即失效。

### 4.4 API 端点

路由前缀：`/api/v1/cockpit`，中间件：VK Auth

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/cockpit/health` | 服务健康检查（无需认证） |
| GET | `/api/v1/cockpit/scope` | 当前 VK 的身份与范围 |
| GET | `/api/v1/cockpit/usage-summary` | scope 内的用量摘要 |
| GET | `/api/v1/cockpit/daily-costs` | scope 内的每日成本序列 |
| GET | `/api/v1/cockpit/cost-by-model` | scope 内按模型分组的成本 |
| GET | `/api/v1/cockpit/budget-status` | VK/Entity 的预算使用情况 |
| GET | `/api/v1/cockpit/recent-requests` | VK/Entity 的近期请求列表 |

### 4.5 端点详细契约

**降级响应通用格式：** 当 Collector 不可用时，所有端点均返回降级响应（HTTP 200），不抛 500：

```json
// 降级时：
{
  "degraded": true,
  "data_source": "cache",
  "message": "Analytics service unavailable. Data may be stale or unavailable.",
  ...
}

// 正常时：
{
  "degraded": false,
  "data_source": "live",
  ...
}
```

各端点降级时的数据字段：

| 端点 | 降级时数据字段 |
|------|--------------|
| `/cockpit/scope` | `entity: null`，`virtual_key` 字段保持（来自 PG） |
| `/cockpit/usage-summary` | 所有数值字段为 `0` |
| `/cockpit/daily-costs` | `data: []` |
| `/cockpit/cost-by-model` | `data: []` |
| `/cockpit/budget-status` | 预算元数据来自 PG，`spent_cents: 0`，`usage_pct: 0` |
| `/cockpit/recent-requests` | `data: []`，`pagination.total: 0` |

---

**GET `/api/v1/cockpit/health`**（无需认证）

```json
{
  "status": "healthy",
  "components": {
    "collector": { "status": "up", "latency_ms": 45 },
    "database": { "status": "up", "latency_ms": 12 }
  },
  "version": "1.0.0"
}
```

状态判定：`healthy`（所有组件 up）/ `degraded`（延迟超阈值：collector > 5000ms、db > 1000ms）/ `unhealthy`（任意组件 down）

---

**GET `/api/v1/cockpit/scope`**

```json
{
  "degraded": false,
  "data_source": "live",
  "workspace": {
    "id": "uuid",
    "name": "Acme Corp"
  },
  "entity": {
    "type": "agent",
    "id": "uuid",
    "name": "Customer Support Bot",
    "department": "Engineering"
  },
  "virtual_key": {
    "id": "uuid",
    "label": "CS-Bot-Key",
    "prefix": "vk-agent-a3f8...",
    "status": "active",
    "allowed_models": ["gpt-4o", "claude-3.5-sonnet"],
    "rate_limit_rpm": 100
  }
}
```

> **`allowed_models`**：仅作参考信息返回，Cockpit API 不基于此字段过滤数据，也不限制用量查询范围。

---

**GET `/api/v1/cockpit/usage-summary?period=7d`**

参数：`period` = `24h` | `7d` | `30d` | `billing_cycle`（默认 `billing_cycle`）

> **`billing_cycle` 定义**：取该工作区当前订阅周期的 `current_period_start` 至 `current_period_end`（来自 `subscriptions` 表）。若工作区无订阅记录，回退到自然月（当月 1 日至今）。

```json
{
  "degraded": false,
  "data_source": "live",
  "period": { "from": "2026-03-25", "to": "2026-03-31" },
  "total_requests": 1247,
  "total_tokens": { "input": 892340, "output": 234120 },
  "total_cost_cents": 4723,
  "vs_previous_period": {
    "requests_pct": -8.2,
    "cost_pct": -12.1
  }
}
```

---

**GET `/api/v1/cockpit/daily-costs?period=7d`**

```json
{
  "degraded": false,
  "data_source": "live",
  "period": { "from": "2026-03-25", "to": "2026-03-31" },
  "data": [
    { "date": "2026-03-25", "cost_cents": 523, "requests": 156, "tokens": 143200 },
    { "date": "2026-03-26", "cost_cents": 710, "requests": 201, "tokens": 189400 }
  ]
}
```

---

**GET `/api/v1/cockpit/cost-by-model?period=7d`**

```json
{
  "degraded": false,
  "data_source": "live",
  "period": { "from": "2026-03-25", "to": "2026-03-31" },
  "data": [
    { "model": "gpt-4o", "provider": "openai", "cost_cents": 3200, "requests": 890, "pct": 67.8 },
    { "model": "claude-3.5-sonnet", "provider": "anthropic", "cost_cents": 1523, "requests": 357, "pct": 32.2 }
  ]
}
```

---

**GET `/api/v1/cockpit/budget-status`**

```json
{
  "degraded": false,
  "data_source": "live",
  "virtual_key_budget": {
    "budget_cents": 10000,
    "spent_cents": 4723,
    "remaining_cents": 5277,
    "usage_pct": 47.23,
    "budget_window": "monthly",
    "budget_action": "alert_only",
    "resets_at": "2026-04-01T00:00:00Z"
  },
  "entity_budget": {
    "budget_cents": 50000,
    "spent_cents": 12800,
    "usage_pct": 25.6
  }
}
```

**枚举值定义：**

```
budget_window : "daily" | "weekly" | "monthly" | "yearly"
budget_action : "alert_only" | "block" | "reduce_quota"
usage_pct     : float64，范围 0-100，表示百分比（47.23 = 47.23%）
```

---

**GET `/api/v1/cockpit/recent-requests?limit=20`**

```json
{
  "degraded": false,
  "data_source": "live",
  "data": [
    {
      "id": "uuid",
      "model": "gpt-4o",
      "provider": "openai",
      "tokens_in": 1200,
      "tokens_out": 340,
      "cost_cents": 4,
      "status": "success",
      "latency_ms": 890,
      "created_at": "2026-03-31T10:00:00Z"
    }
  ],
  "pagination": { "total": 1247, "limit": 20, "offset": 0 }
}
```

**`status` 可选值：**

| 值 | 说明 |
|----|------|
| `success` | 请求成功完成 |
| `failed` | 请求失败（模型错误、超时、被策略拦截等） |
| `pending` | 请求进行中（流式响应场景） |

### 4.6 数据源实现

Cockpit Handler 作为 BFF 层：
1. 从 VK context 解析 scope → 构造 Collector 查询参数（`agentId` / `memberId`）
2. 使用**服务间认证**（内部 API Key，非透传用户 VK）调用 Collector
3. 格式化响应为 Cockpit 契约格式

> **认证安全**：Cockpit Handler 调用 Collector 时使用服务间 API Key（`X-Collector-Service-Key`），不透传用户 VK。VK 仅用于识别用户身份和 scope，不转发到下游服务。

当 Collector 未配置或失败时，返回 §4.5 定义的降级响应，不抛 500。

---

## 5. MCP Server 架构设计（开发线 C）

### 5.1 项目结构

```
alephant-mcp/
├── src/
│   ├── index.ts                 ← 入口：解析模式，启动传输
│   ├── server.ts                ← McpServer 实例创建 + 工具注册
│   ├── auth/
│   │   ├── detector.ts          ← 模式识别（VK / PAT）
│   │   └── types.ts             ← AuthMode 类型定义
│   ├── clients/
│   │   ├── base-client.ts       ← HTTP 客户端基类（重试、错误处理）
│   │   ├── cockpit-client.ts    ← VK 模式：调 /api/v1/cockpit/*
│   │   └── manager-client.ts    ← 管理者模式：调 /api/v1/*
│   ├── tools/
│   │   ├── registry.ts          ← 按模式注册工具的调度器
│   │   ├── shared/              ← 双模式共享工具
│   │   │   ├── usage.ts         ← get_usage_summary, get_daily_costs, get_cost_by_model
│   │   │   └── models.ts        ← list_available_models
│   │   ├── vk/                  ← VK 模式专属工具
│   │   │   ├── scope.ts         ← get_my_scope
│   │   │   └── budget.ts        ← get_my_budget, get_my_recent_requests
│   │   └── manager/             ← 管理者专属工具
│   │       ├── keys.ts          ← list/create/update/revoke virtual keys
│   │       ├── analytics.ts     ← workspace overview, request logs
│   │       ├── agents.ts        ← list agents, agent analytics
│   │       ├── departments.ts   ← list departments, department analytics
│   │       └── policies.ts      ← budget policies, subscription info
│   ├── prompts/
│   │   ├── cost-audit.ts        ← 成本审计报告 Prompt
│   │   └── optimization.ts      ← 成本优化建议 Prompt（管理者）
│   ├── resources/
│   │   └── model-catalog.ts     ← 模型目录 Resource（静态 JSON）
│   ├── utils/
│   │   └── rate-limiter.ts      ← 令牌桶限流器（全局单例）
│   └── types.ts                 ← 共享类型定义
├── data/
│   └── model-catalog.json       ← 静态模型目录（随 npm 包发布，离线可用）
├── docs/
│   └── alephant-mcp-prd.md
├── package.json
├── tsconfig.json
└── README.md
```

### 5.2 启动流程

```typescript
// src/index.ts — 伪代码
const mode = detectAuthMode(process.env);
// → 'vk' | 'manager'

const server = new McpServer({ name: "alephant", version });

const client = createClient(mode, {
  baseUrl: process.env.ALEPHANT_API_BASE_URL,
  vk: process.env.ALEPHANT_VIRTUAL_KEY,
  pat: process.env.ALEPHANT_PAT,
  workspaceId: process.env.ALEPHANT_WORKSPACE_ID, // 管理者模式必需
});

registerTools(server, mode, client);
registerPrompts(server, mode);
registerResources(server, mode, client);

const transport = new StdioServerTransport();
await server.connect(transport);
```

> **`ALEPHANT_WORKSPACE_ID`**：管理者模式（PAT）下，明文 token 不内嵌 workspace UUID，宿主仍需通过此变量告知「当前会话要操作的工作区」；**必须与该 PAT 在 SaaS 中创建时绑定的工作区一致**（服务端校验），见 §3.5。VK 模式无需此变量（`workspace_id` 由 VK 认证中间件注入）。

### 5.3 完整工具集

#### 共享工具（VK 模式 + 管理者都可用，4 个）

| 工具名 | 说明 | 关键参数 | VK 后端 | 管理者后端 |
|--------|------|---------|---------|-----------|
| `get_usage_summary` | 用量摘要 | `period` | cockpit/usage-summary | /analytics/costs |
| `get_daily_costs` | 每日成本趋势 | `period` | cockpit/daily-costs | /analytics/usage |
| `get_cost_by_model` | 按模型成本分布 | `period` | cockpit/cost-by-model | /analytics/models |
| `list_available_models` | 可用模型列表 | — | /models | /models |

> **管理者后端**：共享工具在管理者模式下调用现有 `/api/v1/analytics/*` 端点（PAT 认证），返回工作区全局视图（非 VK-scoped）。

#### VK 模式专属工具（3 个）

| 工具名 | 说明 | 关键参数 | 后端端点 |
|--------|------|---------|---------|
| `get_my_scope` | 查看自己的身份和 VK 范围 | — | cockpit/scope |
| `get_my_budget` | 查看自己的预算使用情况 | — | cockpit/budget-status |
| `get_my_recent_requests` | 查看自己的近期请求 | `limit`（integer，1-100，默认 20） | cockpit/recent-requests |

#### 管理者专属工具（12 个）

| 工具名 | 说明 | 关键参数 | 后端端点 |
|--------|------|---------|---------|
| `get_workspace_overview` | 工作区总览 | — | /workspaces/:id/stats |
| `get_request_logs` | 请求日志查询 | `limit`（integer，1-100，默认 20）、`model`（string，可选）、`status`（"success"\|"failed"，可选） | /logs |
| `list_virtual_keys` | 列出虚拟密钥 | — | /virtual-keys |
| `create_virtual_key` | 创建虚拟密钥 | `label`（string，1-100 字符）、`master_key_id`（string）、`budget_cents`（integer，≥0）、`rate_limit_rpm`（integer，1-10000） | POST /virtual-keys |
| `update_key_budget` | 更新密钥预算 | `key_id`（string）、`budget_cents`（integer，≥0）、`budget_action`（"alert_only"\|"block"） | PATCH /virtual-keys/:id |
| `revoke_virtual_key` | 撤销虚拟密钥 | `key_id`（string） | POST /virtual-keys/:id/revoke |
| `list_agents` | 列出 Agents | `department_id`（string，可选） | /agents |
| `get_agent_analytics` | Agent 用量分析 | `agent_id`（string）、`period`（"24h"\|"7d"\|"30d"） | /agents/:id/analytics |
| `list_departments` | 列出部门 | — | /departments |
| `get_department_analytics` | 部门用量分析 | `department_id`（string）、`period`（"24h"\|"7d"\|"30d"） | /departments/:id/analytics |
| `get_subscription_info` | 订阅与配额信息 | — | /subscriptions/current |
| `set_budget_policy` | 设置预算策略 | `budget_cents`（integer，≥0）、`action`（"alert_only"\|"block"） | PUT /policies/budget-control |

### 5.4 错误处理

遵循 MCP 规范：失败时返回 `isError: true`，不抛异常。按当前模式动态提示认证信息：

```typescript
async function safeCall<T>(
  fn: () => Promise<T>,
  mode: 'vk' | 'manager'
): Promise<ToolResult> {
  try {
    const data = await fn();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
    };
  } catch (err) {
    if (err.status === 401) {
      const hint = mode === 'vk'
        ? "Check your ALEPHANT_VIRTUAL_KEY."
        : "Check your ALEPHANT_PAT and ALEPHANT_WORKSPACE_ID.";
      return {
        content: [{ type: "text", text: `Authentication failed. ${hint}` }],
        isError: true
      };
    }
    if (err.status === 403) {
      return {
        content: [{ type: "text", text: "Permission denied. This operation requires manager mode (PAT) or higher scope." }],
        isError: true
      };
    }
    if (err.status === 429) {
      const retryAfter = err.headers?.['retry-after'] || 60;
      return {
        content: [{ type: "text", text: `Rate limit exceeded. Retry after ${retryAfter} seconds.` }],
        isError: true
      };
    }
    if (err.status === 504) {
      return {
        content: [{ type: "text", text: "Gateway timeout. The backend service is slow to respond." }],
        isError: true
      };
    }
    if (err.status === 500) {
      return {
        content: [{ type: "text", text: "Internal server error. Please contact support." }],
        isError: true
      };
    }
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      return {
        content: [{ type: "text", text: "Request timeout. Check your network connection or API availability." }],
        isError: true
      };
    }
    return {
      content: [{ type: "text", text: `Unexpected error: ${err.message || 'Unknown error'}` }],
      isError: true
    };
  }
}
```

### 5.5 Prompts

| Prompt | 模式 | 说明 |
|--------|------|------|
| `cost_audit_report` | 双模式 | 指导 AI 依次调用 usage/cost/budget 工具，生成结构化审计报告 |
| `cost_optimization` | 管理者 | 指导 AI 分析全工作区成本、模型分布、部门用量，给出优化建议 |

> **`cost_optimization` 依赖**：此 Prompt 需调用 `get_usage_summary`、`get_cost_by_model`、`get_department_analytics` 等工具，在管理者模式下对接现有 `/api/v1/analytics/*` 和 `/api/v1/departments/:id/analytics` 端点。需确保这些端点在 PAT 认证下可访问。

### 5.6 Resources

| Resource | 模式 | 说明 |
|----------|------|------|
| `model-catalog` | 双模式 | 当前支持的 AI 模型与定价，**静态 JSON 文件**（随 npm 包发布，离线可用，无需 API 调用） |

### 5.7 用户配置方式

**Claude Desktop / Cursor 配置示例（VK 模式）：**

```json
{
  "mcpServers": {
    "alephant": {
      "command": "npx",
      "args": ["-y", "@alephant/mcp"],
      "env": {
        "ALEPHANT_API_BASE_URL": "https://api.alephant.ai",
        "ALEPHANT_VIRTUAL_KEY": "vk-agent-a3f8c2..."
      }
    }
  }
}
```

**管理者模式：**

```json
{
  "mcpServers": {
    "alephant": {
      "command": "npx",
      "args": ["-y", "@alephant/mcp"],
      "env": {
        "ALEPHANT_API_BASE_URL": "https://api.alephant.ai",
        "ALEPHANT_PAT": "pat_wsa3f8c2_e4b7d9f1c0a53e8b...",
        "ALEPHANT_WORKSPACE_ID": "your-workspace-uuid"
      }
    }
  }
}
```

**多工作区切换（多个 PAT，多个 MCP 条目）**：在宿主中并列配置多条 server，名称区分即可；每条使用对应工作区的 PAT 与同 UUID 的 `ALEPHANT_WORKSPACE_ID`。

```json
{
  "mcpServers": {
    "alephant-workspace-a": {
      "command": "npx",
      "args": ["-y", "@alephant/mcp"],
      "env": {
        "ALEPHANT_API_BASE_URL": "https://api.alephant.ai",
        "ALEPHANT_PAT": "pat_...workspace-a...",
        "ALEPHANT_WORKSPACE_ID": "uuid-workspace-a"
      }
    },
    "alephant-workspace-b": {
      "command": "npx",
      "args": ["-y", "@alephant/mcp"],
      "env": {
        "ALEPHANT_API_BASE_URL": "https://api.alephant.ai",
        "ALEPHANT_PAT": "pat_...workspace-b...",
        "ALEPHANT_WORKSPACE_ID": "uuid-workspace-b"
      }
    }
  }
}
```

### 5.8 请求限流

AI 助手（Cursor Agent、Claude Desktop）可能在单次对话中连续调用多个 MCP 工具，导致后端 API 超限（429）。MCP Server 在客户端侧实现**令牌桶限流**，主动平滑请求速率，避免触发后端限流。

**与鉴权的关系**：限流仅影响**本 MCP 进程**向外发起 HTTP 的频率；**VK / PAT 是否有效、scope 是否足够**仍完全由 backend-saas-service 判定（§3.4、§4.3）。不得将「限流」理解为 VK 模式下的安全边界——泄露的 VK 仍可能被他人用于调用（直至服务端撤销密钥），与 PAT 同类，需配合密钥保管与后端策略。

**设计要点：**

- 算法：令牌桶（Token Bucket）
- 粒度：全局单例，跨工具共享同一个限流器
- 行为：**队列等待**（而非直接拒绝）——AI 助手通常可容忍数秒延迟，拒绝会导致工具调用失败，体验更差
- 默认速率：60 RPM（每秒 1 个请求），可通过环境变量覆盖

**环境变量：**

```
ALEPHANT_RATE_LIMIT_RPM=60   # 每分钟最大请求数，默认 60，设为 0 禁用限流
```

**实现：**

```typescript
// src/utils/rate-limiter.ts
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(private rpm: number = 60) {
    this.tokens = rpm;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    if (this.rpm === 0) return; // 禁用限流
    this.refill();
    if (this.tokens <= 0) {
      const waitMs = Math.ceil((-this.tokens) * (60000 / this.rpm));
      await new Promise(r => setTimeout(r, waitMs));
      this.refill();
    }
    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.rpm, this.tokens + (elapsed / 60000) * this.rpm);
    this.lastRefill = now;
  }
}

// 全局单例，在 index.ts 初始化时创建
export const globalRateLimiter = new RateLimiter(
  parseInt(process.env.ALEPHANT_RATE_LIMIT_RPM ?? '60', 10)
);
```

**集成方式：** 在 `safeCall` 函数入口处调用 `await globalRateLimiter.acquire()`，所有工具调用自动受限。

```typescript
async function safeCall<T>(fn: () => Promise<T>, mode: 'vk' | 'manager'): Promise<ToolResult> {
  await globalRateLimiter.acquire(); // 限流等待
  try {
    // ... 原有逻辑
  }
}
```

**集成测试：** 快速连续调用 10 个工具，观察总耗时是否符合 RPM 预期；验证 `ALEPHANT_RATE_LIMIT_RPM=0` 时跳过限流。

### 5.9 发布与目录注册

#### npm 包发布

包名从 `@gengbingbing/alephant-mcp` 迁移到 `@alephant/mcp`。`package.json` 关键字段：

```json
{
  "name": "@alephant/mcp",
  "version": "1.0.0",
  "description": "Alephant MCP Server — query AI spend, manage keys and policies from your AI IDE",
  "keywords": ["mcp", "alephant", "finops", "ai-cost", "llm-observability"],
  "homepage": "https://alephant.ai",
  "repository": "https://github.com/alephant-ai/alephant-mcp",
  "bin": { "alephant-mcp": "dist/index.js" }
}
```

发布命令：`npm publish --access public`。发布后用户可直接 `npx -y @alephant/mcp` 使用。

#### MCP 目录注册

| 目录 | 注册方式 | 所需材料 |
|------|----------|---------|
| **modelcontextprotocol.io** | 向 [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) 提 PR，在 `README.md` 对应分类中添加条目 | 包名、描述、主页链接、工具列表摘要 |
| **Smithery** ([smithery.ai/servers](https://smithery.ai/servers)) | 在仓库根目录添加 `smithery.yaml` 配置文件，Smithery 机器人自动检测 | 见下方 `smithery.yaml` 示例 |
| **Glama** ([glama.ai/mcp/servers](https://glama.ai/mcp/servers)) | 提交 GitHub 仓库 URL 到 Glama 提交表单 | 公开 GitHub 仓库、有效的 `package.json` |

**`smithery.yaml` 示例：**

```yaml
name: alephant
displayName: Alephant
description: Query AI spend, manage virtual keys and policies directly from Cursor, Claude Desktop, or VS Code Copilot.
homepage: https://alephant.ai
icon: https://alephant.ai/favicon.ico
config:
  - key: ALEPHANT_API_BASE_URL
    description: Alephant API base URL
    required: true
    default: https://api.alephant.ai
  - key: ALEPHANT_VIRTUAL_KEY
    description: Virtual Key for member/read-only mode (use this OR ALEPHANT_PAT)
    required: false
  - key: ALEPHANT_PAT
    description: Personal Access Token for manager mode
    required: false
  - key: ALEPHANT_WORKSPACE_ID
    description: Workspace UUID (required when using PAT)
    required: false
  - key: ALEPHANT_RATE_LIMIT_RPM
    description: Max requests per minute (default 60, set to 0 to disable)
    required: false
    default: "60"
tools:
  - get_usage_summary
  - get_daily_costs
  - get_cost_by_model
  - list_available_models
  - get_my_scope
  - get_my_budget
  - get_my_recent_requests
  - get_workspace_overview
  - list_virtual_keys
  - create_virtual_key
  - update_key_budget
  - revoke_virtual_key
  - list_agents
  - get_agent_analytics
  - list_departments
  - get_department_analytics
  - get_subscription_info
  - set_budget_policy
  - get_request_logs
```

**注册时序：** npm 包发布 → 更新 smithery.yaml → 向 modelcontextprotocol/servers 提 PR → 提交 Glama。三个目录注册完成后，用户可在 Smithery / Glama 搜索 "alephant" 一键安装。

---

## 6. 并行开发计划

### 6.1 开工前置（Day 0）

所有开发线开工前，须完成：
- 本设计文档获批 ✅
- API 契约确认（本文档 §3.3 / §4.4-4.5 即为契约）

### 6.2 三线并行

```
时间线 ──────────────────────────────────────────────────▶

开发线 A (PAT 系统)
  ├─ DB migration + PAT repo/service ──▶ PAT API handlers ──▶ Auth 中间件扩展 ──▶ 前端 PAT 面板 ──▶
  │                                                                                              │
开发线 B (Cockpit API)                                                                           │
  ├─ VK Auth 中间件 ──▶ Cockpit handler + Collector 对接 ──▶ 端点测试 ──────────────────────────▶ │
  │                                                                                              │
开发线 C (MCP Server)                                                                            │
  ├─ 架构重构 + 模式检测 ──▶ Client 层 ──▶ 工具定义 ──▶ Prompts/Resources ──────────────────────▶ │
  │                                                                                              │
  └──────────────────────────────────────────────────────────── 集成测试 ◀─────────────────────────┘
```

### 6.3 集成测试清单

- [ ] PAT 创建 → MCP 管理者模式 → 调用全部管理者工具
- [ ] VK 配置 → MCP VK 模式 → 调用全部 VK 专属工具
- [ ] 过期的 PAT → 401 错误（测试步骤：创建 `expires_at` 为过去时间的 PAT → 配置到 MCP → 调用任意工具）
- [ ] 撤销的 PAT → 401 错误（测试步骤：创建 PAT → 调用 DELETE /pats/:id → 重新配置到 MCP → 调用工具）
- [ ] 禁用的 VK → 401 错误（测试步骤：将 VK `status` 改为 `'disabled'` → 配置到 MCP → 调用工具）
- [ ] Scopes 限制：read-only PAT 调用写操作 → 403 错误
- [ ] Collector 不可用时 → 降级响应（`degraded: true` + 零值/空数组数据）
- [ ] 429 速率限制 → retryAfter 提示正确展示
- [ ] MCP Inspector 手动测试全部工具
- [ ] Claude Desktop / Cursor 端到端测试

---

## 7. 后续扩展（不在本次范围）

- **Streamable HTTP 传输**：部署到 `mcp.alephant.ai/mcp`，支持远程访问
- **OAuth 2.1 Device Flow**：远程传输的认证方案
- **`apply_cost_policy` 工具**：通过 MCP 直接切换 low-cost / high-performance / block 策略（需先定义后端策略切换 API 契约）
- **更多工具**：Webhook 管理、审计日志查询、告警规则配置
- **VK Token 版本管理**：若 VK 格式升级（如 `vk2-`），通过前缀检测支持平滑迁移

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-03-31 | 初稿：双模式架构设计（PAT 系统 + Cockpit API + MCP Server） |
| 2026-04-01 | 基于 design-review 更新：移除 Mock 模式残留；补充 PAT 端点完整契约（分页格式、PATCH 请求字段、DELETE 204、workspace_id 来源说明）；补充 slug-hash 计算规范；添加 VK 状态模型与统一 401；补充所有 Cockpit 端点降级格式；添加 health check 端点；修复架构图工具数量 (16→12)；明确共享工具管理者后端为现有 /analytics/* 端点；完善错误处理（429/504/500/超时）；添加 ALEPHANT_WORKSPACE_ID 环境变量；明确 model-catalog 为静态 JSON；补充 billing_cycle 定义；澄清认证头已简化；明确 VK 数据隔离规则；添加服务间认证安全说明；补充工具参数类型约束。 |
| 2026-04-01 | 将「MCP Server 请求限流」和「MCP 目录注册」从后续扩展升级为正式设计（§5.8 / §5.9）：新增令牌桶限流实现、ALEPHANT_RATE_LIMIT_RPM 环境变量、smithery.yaml 配置示例及三大目录注册时序。 |
| 2026-04-01 | §2.1 补充 VK 字符串形态与服务端鉴权关系；§3.5 / §5.2 / §5.7 明确多 PAT 与多 `mcpServers` 条目切换工作区、`ALEPHANT_WORKSPACE_ID` 须与 PAT 绑定一致及服务端校验；§5.8 明确限流不替代鉴权。 |
