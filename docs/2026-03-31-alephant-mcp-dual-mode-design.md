# Alephant MCP Server — 双模式架构设计

**日期**: 2026-03-31  
**状态**: Draft  
**范围**: alephant-mcp + backend-saas-service + Alephantinterface  

---

## 1. 概述

为 Alephant BYO-KEY 平台构建 MCP（Model Context Protocol）Server，使开发者和管理者能在 Cursor、Claude Desktop、VS Code Copilot 等 AI 工具中通过自然语言查询 AI 支出、管理密钥和策略。

> **与旧版 PRD 的关系**：本文档取代 `alephant-mcp/docs/alephant-mcp-prd.md`（2026-02-28 单模式设计）。旧 PRD 定义 12 个工具（单模式），本设计扩展为 19 个工具（双模式：4 共享 + 3 成员专属 + 12 管理者专属）。旧 PRD 保留作历史参考，实现以本文档为准。

### 1.1 核心决策

| 决策项 | 结论 |
|--------|------|
| 目标用户 | 成员/开发者（VK）+ 管理者/Admin（PAT），双模式 |
| 管理者认证 | 第一阶段 Personal Access Token（PAT），后续加 OAuth 2.1 Device Flow |
| 成员认证 | Virtual Key（现有凭证） |
| Cockpit API | 不存在，需在 backend-saas-service 中新建 |
| 项目范围 | 全包：MCP Server + 后端 PAT + 后端 Cockpit API + 前端 PAT 面板 |
| 构建策略 | 并行开发三条线（PAT 系统 / Cockpit API / MCP Server） |
| 传输协议 | 第一阶段 Stdio（npm 分发），后续加 Streamable HTTP |

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
│  │                     │  │Member│    │  Manager   │   │  │  │
│  │                     │  │Tools │    │  Tools     │   │  │  │
│  │                     │  │(7)   │    │  (16)      │   │  │  │
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
| `ALEPHANT_VIRTUAL_KEY` | `vk-xxx...` | 成员模式 | `Authorization: Bearer <vk>` + `X-Alephant-Virtual-Key` |
| `ALEPHANT_PAT` | `pat_xxx...` | 管理者模式 | `Authorization: Bearer <pat>` |
| 两者都提供 | — | 管理者模式（PAT 优先） | `Authorization: Bearer <pat>` |
| 都不提供 | — | 报错退出（缺少认证凭证） | — |

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

- `pat_` 前缀 → 一眼识别为 PAT（区别于 `vk-` 虚拟密钥）
- `ws` 段 → 帮助用户识别属于哪个工作区
- 随机段 → 密码学安全的随机 bytes

### 3.3 后端 API 端点

路由：`/api/v1/pats`，中间件：`RequireAuth` + `RequireWorkspace`（JWT 登录后操作），权限：`owner` / `admin`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/pats` | 列出当前工作区的 PATs |
| POST | `/api/v1/pats` | 创建 PAT（返回明文 token，仅此一次） |
| GET | `/api/v1/pats/:id` | PAT 详情（不含 token 明文） |
| PATCH | `/api/v1/pats/:id` | 更新名称/过期时间 |
| DELETE | `/api/v1/pats/:id` | 撤销 PAT |

**创建请求/响应：**

```json
// POST /api/v1/pats — Request
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

### 3.4 PAT 认证中间件

在 backend-saas-service 的 auth 中间件中扩展，处理 `Authorization: Bearer pat_xxx` 请求：

1. 检测 Bearer token 前缀是否为 `pat_`
2. SHA-256 哈希后查 `personal_access_tokens` 表
3. 检查：未撤销（`revoked_at IS NULL`）、未过期（`expires_at IS NULL OR expires_at > now()`）
4. 从 PAT 记录获取 `user_id` + `workspace_id`，注入 context（等效于 JWT + X-Workspace-Id）
5. 检查 `scopes` 是否包含当前操作所需的权限
6. 异步更新 `last_used_at`
7. 后续 handler 无需感知是 JWT 还是 PAT

**Scopes 到操作的映射：**

| Scope | 允许的操作 | 对应端点示例 |
|-------|-----------|-------------|
| `read` | 所有 GET 请求（分析、列表、详情、订阅信息） | GET /analytics/*, GET /virtual-keys, GET /subscriptions/current |
| `write` | 创建、修改、撤销密钥和 Agent | POST /virtual-keys, PATCH /virtual-keys/:id, POST /virtual-keys/:id/revoke |
| `admin` | 策略配置、工作区设置、预算控制 | PUT /policies/*, PATCH /settings/* |

`write` 隐含 `read`，`admin` 隐含 `write` + `read`。

### 3.5 前端 PAT 管理面板

位置：Settings → API Access（或 Developer Settings）

核心交互：
- 列表展示已有 PATs：名称、前缀、Scopes 标签、最后使用时间、过期状态
- 创建按钮 → 弹窗：填名称、选 Scopes（多选 checkbox）、设过期时间（可选 datepicker）
- 创建成功 → 一次性展示完整 token，带复制按钮 + 警告文案「此 token 不再显示，请立即复制保存」+ MCP 配置 JSON 片段
- 每条 PAT 支持撤销操作（确认弹窗）
- 显示 MCP 配置代码片段（Claude Desktop / Cursor JSON 格式），方便用户直接复制
- **多工作区支持**：用户为每个工作区创建独立 PAT，通过 token_prefix 前缀识别

---

## 4. Cockpit API 设计（开发线 B）

### 4.1 设计原则

- 认证凭证：Virtual Key（`Authorization: Bearer vk-xxx`）
- 数据范围：仅限 VK 绑定的实体（agent 或 member）的用量
- 操作类型：全部只读
- 数据源：Collector Analytics API（与现有 analytics 端点一致）

### 4.2 VK → Scope 映射

```
VK 认证
  │
  ▼
查 virtual_keys 表（by key_hash, WHERE deleted_at IS NULL AND status = 'active'）
  │
  ├─ entity_type = 'agent'  → scope = 该 Agent 的用量
  ├─ entity_type = 'member' → scope = 该 Member 的用量
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

### 4.4 API 端点

路由前缀：`/api/v1/cockpit`，中间件：VK Auth

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/cockpit/scope` | 当前 VK 的身份与范围 |
| GET | `/api/v1/cockpit/usage-summary` | scope 内的用量摘要 |
| GET | `/api/v1/cockpit/daily-costs` | scope 内的每日成本序列 |
| GET | `/api/v1/cockpit/cost-by-model` | scope 内按模型分组的成本 |
| GET | `/api/v1/cockpit/budget-status` | VK/Entity 的预算使用情况 |

### 4.5 端点详细契约

**GET `/api/v1/cockpit/scope`**

```json
{
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

**GET `/api/v1/cockpit/usage-summary?period=7d`**

参数：`period` = `24h` | `7d` | `30d` | `billing_cycle`（默认 `billing_cycle`）

```json
{
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

**GET `/api/v1/cockpit/daily-costs?period=7d`**

```json
{
  "period": { "from": "2026-03-25", "to": "2026-03-31" },
  "data": [
    { "date": "2026-03-25", "cost_cents": 523, "requests": 156, "tokens": 143200 },
    { "date": "2026-03-26", "cost_cents": 710, "requests": 201, "tokens": 189400 }
  ]
}
```

**GET `/api/v1/cockpit/cost-by-model?period=7d`**

```json
{
  "data": [
    { "model": "gpt-4o", "provider": "openai", "cost_cents": 3200, "requests": 890, "pct": 67.8 },
    { "model": "claude-3.5-sonnet", "provider": "anthropic", "cost_cents": 1523, "requests": 357, "pct": 32.2 }
  ]
}
```

**GET `/api/v1/cockpit/budget-status`**

```json
{
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

### 4.6 数据源实现

Cockpit Handler 作为 BFF 层：
1. 从 VK context 解析 scope → 构造 Collector 查询参数（`agentId` / `memberId`）
2. 转发认证头至 Collector（复用 `AnalyticsService` 的 `WithAuthHeader` 模式）
3. 格式化响应为 Cockpit 契约格式

当 Collector 未配置或失败时，返回降级响应（零值 + 说明字段），不抛 500。

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
│   │   ├── cockpit-client.ts    ← 成员模式：调 /api/v1/cockpit/*
│   │   ├── manager-client.ts    ← 管理者模式：调 /api/v1/*
│   │   └── mock-client.ts       ← Mock 模式：返回示例数据
│   ├── tools/
│   │   ├── registry.ts          ← 按模式注册工具的调度器
│   │   ├── shared/              ← 双模式共享工具
│   │   │   ├── usage.ts         ← get_usage_summary, get_daily_costs, get_cost_by_model
│   │   │   └── models.ts        ← list_available_models
│   │   ├── member/              ← 成员专属工具
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
│   │   └── model-catalog.ts     ← 模型目录 Resource（只读）
│   └── types.ts                 ← 共享类型定义
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
// → 'member' | 'manager' | 'mock'

const server = new McpServer({ name: "alephant", version });

const client = createClient(mode, {
  baseUrl: process.env.ALEPHANT_API_BASE_URL,
  vk: process.env.ALEPHANT_VIRTUAL_KEY,
  pat: process.env.ALEPHANT_PAT,
});

registerTools(server, mode, client);
registerPrompts(server, mode);
registerResources(server, mode, client);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 5.3 完整工具集

#### 共享工具（成员 + 管理者都可用，4 个）

| 工具名 | 说明 | 关键参数 | 成员后端 | 管理者后端 |
|--------|------|---------|---------|-----------|
| `get_usage_summary` | 用量摘要 | `period` | cockpit/usage-summary | analytics/overview |
| `get_daily_costs` | 每日成本趋势 | `period` | cockpit/daily-costs | analytics/usage |
| `get_cost_by_model` | 按模型成本分布 | `period` | cockpit/cost-by-model | analytics/models |
| `list_available_models` | 可用模型列表 | — | /models | /models |

#### 成员专属工具（3 个）

| 工具名 | 说明 | 关键参数 | 后端端点 |
|--------|------|---------|---------|
| `get_my_scope` | 查看自己的身份和 VK 范围 | — | cockpit/scope |
| `get_my_budget` | 查看自己的预算使用情况 | — | cockpit/budget-status |
| `get_my_recent_requests` | 查看自己的近期请求 | `limit` | cockpit/recent-requests |

#### 管理者专属工具（12 个）

| 工具名 | 说明 | 关键参数 | 后端端点 |
|--------|------|---------|---------|
| `get_workspace_overview` | 工作区总览 | — | /workspaces/:id/stats |
| `get_request_logs` | 请求日志查询 | `limit`, `model`, `status` | /logs |
| `list_virtual_keys` | 列出虚拟密钥 | — | /virtual-keys |
| `create_virtual_key` | 创建虚拟密钥 | `label`, `master_key_id`, `budget_cents`, `rate_limit_rpm` | POST /virtual-keys |
| `update_key_budget` | 更新密钥预算 | `key_id`, `budget_cents`, `budget_action` | PATCH /virtual-keys/:id |
| `revoke_virtual_key` | 撤销虚拟密钥 | `key_id` | POST /virtual-keys/:id/revoke |
| `list_agents` | 列出 Agents | `department_id`(optional) | /agents |
| `get_agent_analytics` | Agent 用量分析 | `agent_id`, `period` | /agents/:id/analytics |
| `list_departments` | 列出部门 | — | /departments |
| `get_department_analytics` | 部门用量分析 | `department_id`, `period` | /departments/:id/analytics |
| `get_subscription_info` | 订阅与配额信息 | — | /subscriptions/current |
| `set_budget_policy` | 设置预算策略 | `budget_cents`, `action` | PUT /policies/budget-control |

### 5.4 错误处理

遵循 MCP 规范：失败时返回 `isError: true`，不抛异常：

```typescript
async function safeCall<T>(fn: () => Promise<T>): Promise<ToolResult> {
  try {
    const data = await fn();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
    };
  } catch (err) {
    if (err.status === 401) {
      return {
        content: [{ type: "text", text: "Authentication failed. Check your ALEPHANT_PAT or ALEPHANT_VIRTUAL_KEY." }],
        isError: true
      };
    }
    if (err.status === 403) {
      return {
        content: [{ type: "text", text: "Permission denied. This operation requires manager mode (PAT)." }],
        isError: true
      };
    }
    return {
      content: [{ type: "text", text: `API error: ${err.message}` }],
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

### 5.6 Resources

| Resource | 模式 | 说明 |
|----------|------|------|
| `model-catalog` | 双模式 | 当前支持的 AI 模型与定价，只读引用数据 |

### 5.7 用户配置方式

**Claude Desktop / Cursor 配置示例（成员模式）：**

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
        "ALEPHANT_PAT": "pat_wsa3f8c2_e4b7d9f1c0a53e8b..."
      }
    }
  }
}
```

---

## 6. 并行开发计划

### 6.1 开工前置（Day 0）

所有开发线开工前，须完成：
- 本设计文档获批 ✅
- API 契约确认（本文档 §3.3 / §4.4-4.5 即为契约）
- Mock 数据约定

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
  ├─ 架构重构 + 模式检测 ──▶ Client 层 (mock) ──▶ 工具定义 ──▶ Prompts/Resources ──────────────▶ │
  │                                                                                              │
  └──────────────────────────────────────────────────────────── 集成测试 ◀─────────────────────────┘
```

### 6.3 集成测试清单

- [ ] PAT 创建 → MCP 管理者模式 → 调用全部管理者工具
- [ ] VK 配置 → MCP 成员模式 → 调用全部成员工具
- [ ] 无凭证 → Mock 模式 → 全部工具返回示例数据
- [ ] 过期/撤销的 PAT → 401 错误
- [ ] 禁用的 VK → 401 错误
- [ ] Scopes 限制：read-only PAT 调用写操作 → 403 错误
- [ ] Collector 不可用时 → 降级响应（零值 + 说明）
- [ ] MCP Inspector 手动测试全部工具
- [ ] Claude Desktop / Cursor 端到端测试

---

## 7. 后续扩展（不在本次范围）

- **Streamable HTTP 传输**：部署到 `mcp.alephant.ai/mcp`，支持远程访问
- **OAuth 2.1 Device Flow**：远程传输的认证方案
- **`apply_cost_policy` 工具**：通过 MCP 直接切换 low-cost / high-performance / block 策略（需先定义后端策略切换 API 契约）
- **更多工具**：Webhook 管理、审计日志查询、告警规则配置
- **npm 发布**：从 `@gengbingbing/alephant-mcp` 迁移到 `@alephant/mcp`
- **MCP 目录注册**：modelcontextprotocol.io / Smithery / Glama
