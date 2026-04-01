# Alephant MCP 双模式架构设计 - 分析报告

**分析日期**: 2026-04-01  
**源文件**: `docs/2026-03-31-alephant-mcp-dual-mode-design.md`  
**状态**: 审查完成

---

## 📋 文档概览

| 属性 | 内容 |
|------|------|
| 标题 | Alephant MCP Server — 双模式架构设计 |
| 日期 | 2026-03-31 |
| 状态 | Draft |
| 范围 | alephant-mcp + backend-saas-service + Alephantinterface |

---

## ✅ 设计亮点

### 1. 清晰的双模式认证设计

```
成员模式: ALEPHANT_VIRTUAL_KEY → Cockpit API (只读)
管理者模式: ALEPHANT_PAT → REST API /v1 (读写)
```

认证流程设计合理，通过 `AuthDetector` 自动识别模式，切换不同的客户端和工具集。

### 2. 三条并行开发线解耦良好

| 开发线 | 工程 | 交付物 | 依赖关系 |
|--------|------|--------|----------|
| A: PAT 系统 | backend-saas-service + Alephantinterface | PAT 表 + CRUD API + 认证中间件 + 前端管理面板 | 无 |
| B: Cockpit API | backend-saas-service | VK-scoped 只读 API | 无 |
| C: MCP Server | alephant-mcp | 双模式框架 + 全部工具定义 + API Client | 依赖 A、B 的接口契约 |

通过 API 契约解耦，三条线可独立开发、契约联调（不使用 Mock Client）。

### 3. 工具集设计合理

- **共享工具**: 4 个（usage-summary / daily-costs / cost-by-model / available-models）
- **成员专属**: 3 个（scope / budget / recent-requests）
- **管理者专属**: 12 个（keys / agents / departments / policies / analytics）

工具划分清晰，符合最小权限原则。

### 4. PAT 安全性设计正确

- Token 明文只在创建时返回一次
- 存储 SHA-256 哈希值
- 支持 scopes 权限粒度控制（read/write/admin）
- 绑定单一工作区

### 5. Cockpit API 降级策略

当 Collector 不可用时，返回降级响应而非 500 错误，保证 MCP Server 可用性。

---

## ⚠️ 潜在问题与建议

### 问题 1: PAT Token 格式规范不明确

**当前设计**:
```
pat_ws<workspace-slug-hash-6chars>_<32-bytes-random-hex>
示例: pat_wsa3f8c2_e4b7d9f1c0a53e8b...
```

**问题**:
- `workspace-slug-hash-6chars` 的计算方式不明确
- slug 可能包含特殊字符，hash 逻辑需定义
- 总长度可能在 45-80 字符之间波动

**建议**: 保留 `slug-hash` 设计（可读性优于纯 UUID 前缀），补充计算规范：

```typescript
// workspace-slug-hash = SHA256(slug).substring(0, 6).toLowerCase()
// 其中 slug 为小写字母数字连字符，非字母数字字符需 normalize 后计算
// 示例: "My Workspace" → normalize → "my-workspace" → hash → "a3f8c2"
```

| 方案 | 可读性 | 实现复杂度 | 推荐 |
|------|--------|------------|------|
| slug-hash (当前) | 高 (a3f8c2 可联想) | 需定义 normalize 规则 | ✅ |
| UUID 前缀 | 低 (a3f8c2 无法联想) | 简单 | ❌ |

**优先级**: 中

---

### 问题 2: 降级响应格式未定义

**当前状态**: §4.6 提到"返回降级响应（零值 + 说明字段）"，但未定义具体格式

**建议**: 在 §4.4 添加标准降级响应格式：

```json
// GET /api/v1/cockpit/usage-summary (正常状态)
{
  "degraded": false,
  "data_source": "live",
  "data": {
    "total_requests": 1250,
    "total_cost_cents": 4500
  }
}

// GET /api/v1/cockpit/usage-summary (降级状态)
{
  "degraded": true,
  "message": "Analytics service unavailable. Showing cached data from 2026-03-31T10:00:00Z.",
  "data_source": "cache",
  "data": {
    "total_requests": 0,
    "total_cost_cents": 0
  }
}
```

**关键约束**: `data_source` 标识数据来源 (`live` / `cache`)，始终返回以确保客户端兼容。`fallback_data` 字段不再使用。

**优先级**: 中

---

### 问题 3: 错误处理需要增强

**当前 §5.4 只处理**:

| HTTP 状态码 | 处理 |
|-------------|------|
| 401 | 认证失败提示 |
| 403 | 权限不足提示 |

**缺失场景**:

| 状态码 | 建议处理 |
|--------|----------|
| 429 | `Rate limit exceeded. Retry after {retry_after} seconds.` |
| 504 | `Gateway timeout. The backend service is slow to respond.` |
| 500 | `Internal server error. Please contact support.` |
| 网络超时 | `Request timeout. Check your network connection.` |

**建议扩展**:

```typescript
async function safeCall<T>(fn: () => Promise<T>): Promise<ToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    if (err.status === 401) {
      return {
        content: [{ type: "text", text: "Authentication failed. Check your API key." }],
        isError: true
      };
    }
    if (err.status === 403) {
      return {
        content: [{ type: "text", text: "Permission denied." }],
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

**优先级**: 高

---

### 问题 4: VK Auth 中间件缺少 Token 版本管理

**问题**: 如果未来 VK 格式变更（如从 `vk-` 升级到 `vk2-`），无法平滑迁移

**建议**:

```typescript
// src/auth/vk-version-detector.ts
interface VKVersion {
  version: 'v1' | 'v2';
  isLegacy: boolean;
}

function detectVKVersion(token: string): VKVersion {
  if (token.startsWith('vk2-')) {
    return { version: 'v2', isLegacy: false };
  }
  if (token.startsWith('vk-')) {
    return { version: 'v1', isLegacy: true };
  }
  throw new Error('Invalid VK format');
}
```

**优先级**: 低（预防性设计）

---

### 问题 5: 缺少 Health Check 端点

**建议**: 在 Cockpit API 添加健康检查端点

```json
// GET /api/v1/cockpit/health
{
  "status": "healthy" | "degraded" | "unhealthy",
  "components": {
    "collector": { "status": "up", "latency_ms": 45 },
    "database": { "status": "up", "latency_ms": 12 }
  },
  "version": "1.0.0"
}
```

**状态判定规则**:
- `healthy`: 所有组件 `status === "up"`
- `degraded`: 任意组件 `latency_ms` 超过阈值（collector > 5000ms, db > 1000ms）
- `unhealthy`: 任意组件 `status === "down"`

**优先级**: 中

---

### 问题 7: PAT 创建缺少 workspace 权限验证

**问题**: §3.4 未说明用户创建 PAT 时，后端如何验证用户是否属于目标 workspace

**建议**: POST /api/v1/pats 实现应包含：

1. 从 JWT 获取 `user_id`
2. 验证 `user_id` 属于请求体中的 `workspace_id`
3. 或验证用户在该 workspace 具有 owner/admin 角色

```typescript
// POST /api/v1/pats handler
async function createPAT(req: Request, res: Response) {
  const { user_id, workspace_id } = req.context; // from JWT
  const hasAccess = await workspaceService.userHasAccess(user_id, workspace_id, ['owner', 'admin']);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Only workspace owner/admin can create PAT' });
  }
  // proceed with PAT creation
}
```

**优先级**: 高

---

### 问题 8: 缺少认证缓存失效机制

**问题**: PAT 撤销后，MCP Server 可能缓存了认证状态，导致已撤销的 PAT 仍可使用

**建议**:

1. **方案 A（推荐）**: MCP Server 不缓存 PAT 认证，每次请求实时验证
2. **方案 B**: 后端提供 token 黑名单 API，MCP Server 定期拉取

```typescript
// 方案 A 示例
class ManagerClient {
  async validateToken(pat: string): Promise<boolean> {
    // 每次请求都验证，不使用本地缓存
    return await this.authService.verifyPAT(pat);
  }
}
```

**优先级**: 高

---

### 问题 9: VK 的 `master_key_id` 用途未说明

**问题**: §4.3 VK 认证中间件注入 context 包含 `master_key_id`，但未说明用途

**建议**: 补充说明 `master_key_id` 用于：
- 关联 VK 到其所属的 Master Key（成本归属、权限继承）
- 在 `create_virtual_key` 工具中作为必填参数

**优先级**: 低

---

### 问题 10: MCP Server 缺少请求限流

**问题**: AI 助手可能频繁调用 MCP 工具，导致 API 超限

**建议**: 在 MCP Server 添加请求限流

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
```

**优先级**: 中

---

### 问题 11: Cockpit API 降级格式不完整

**问题**: §4.4-4.5 中只有 usage-summary 定义了降级格式，其他 5 个端点未定义

**建议**: 补充所有 Cockpit API 端点的降级格式：

| 端点 | 降级时返回 |
|------|-----------|
| `/cockpit/scope` | `entity: null`, `degraded: true`, `message` |
| `/cockpit/daily-costs` | `data: []`, `degraded: true`, `message` |
| `/cockpit/cost-by-model` | `data: []`, `degraded: true`, `message` |
| `/cockpit/budget-status` | 所有字段为 `null` 或 `0`, `degraded: true`, `message` |
| `/cockpit/recent-requests` | `data: []`, `pagination: { total: 0 }`, `degraded: true`, `message` |

**优先级**: 中

---

### 问题 12: 管理者工具 API 端点契约缺失

**问题**: §5.3 列出的 12 个管理工具对应的 REST API 端点未在 §3 中定义

**缺失的 API 契约**:

| 工具 | 后端端点 | 需补充 |
|------|----------|--------|
| `get_workspace_overview` | GET /workspaces/:id/stats | 请求/响应格式 |
| `get_request_logs` | GET /logs | 请求/响应格式 |
| `list_virtual_keys` | GET /virtual-keys | 请求/响应格式 |
| `create_virtual_key` | POST /virtual-keys | 请求/响应格式 |
| `update_key_budget` | PATCH /virtual-keys/:id | 请求/响应格式 |
| `revoke_virtual_key` | POST /virtual-keys/:id/revoke | 请求/响应格式 |
| `list_agents` | GET /agents | 请求/响应格式 |
| `get_agent_analytics` | GET /agents/:id/analytics | 请求/响应格式 |
| `list_departments` | GET /departments | 请求/响应格式 |
| `get_department_analytics` | GET /departments/:id/analytics | 请求/响应格式 |
| `get_subscription_info` | GET /subscriptions/current | 请求/响应格式 |
| `set_budget_policy` | PUT /policies/budget-control | 请求/响应格式 |

**优先级**: 高

---

### 问题 13: 工具参数类型未定义

**问题**: §5.3 中工具参数缺少类型和约束

**建议补充参数 Schema**:

| 工具 | 参数 | 类型 | 约束 |
|------|------|------|------|
| `create_virtual_key` | label | string | 1-100 chars |
| `create_virtual_key` | budget_cents | integer | >= 0 |
| `create_virtual_key` | rate_limit_rpm | integer | 1-10000 |
| `update_key_budget` | budget_cents | integer | >= 0 |
| update_key_budget | budget_action | string | "alert_only" \| "block" |
| `get_request_logs` | model | string | optional |
| `get_request_logs` | status | string | optional, "success" \| "failed" |
| `get_request_logs` | limit | integer | 1-100, default 20 |
| `get_agent_analytics` | period | string | "24h" \| "7d" \| "30d" |
| `set_budget_policy` | budget_cents | integer | >= 0 |
| `set_budget_policy` | action | string | "alert_only" \| "block" |

**优先级**: 中

---

### 问题 14: recent-requests status 值未定义

**问题**: §4.5 中 `status: "success"` 未说明所有可选值

**建议补充**:

```typescript
status: "success" | "failed" | "pending"
```

| 值 | 说明 |
|----|------|
| `success` | 请求成功完成 |
| `failed` | 请求失败（如模型错误、超时） |
| `pending` | 请求进行中（流式响应场景） |

**优先级**: 低

---

### 问题 15: cost-by-model 响应缺少 period 字段

**问题**: §4.5 中 cost-by-model 请求有 period 参数，但响应无 period 字段（与 usage-summary/daily-costs 不一致）

**建议**: 响应添加 period 字段：

```json
{
  "period": { "from": "2026-03-25", "to": "2026-03-31" },
  "data": [...]
}
```

**优先级**: 低

---

### 问题 16: VK 数据隔离边界未明确

**问题**: §4.2 说"VK scope 仅限绑定实体的用量"，但未明确：
- 成员 A 的 VK 能否查询成员 B 的数据？
- VK 能否跨越 Agent/Member 查询？

**建议**: 在 §4.1 或 §4.2 中明确 Cockpit API 的数据隔离规则：
- VK 只能查询自己绑定的 entity（agent 或 member）的数据
- VK 无法查询工作区内其他 entity 的数据

**优先级**: 中

---

### 问题 17: PAT 模式下能否调用 Cockpit API

**问题**: 设计中 PAT → REST API，VK → Cockpit API，但管理者也需要查看用量数据

**建议**: 明确两种方案：

| 方案 | 说明 |
|------|------|
| A | PAT 可同时调用 REST API 和 Cockpit API（统一认证） |
| B | PAT 只调 REST API，管理者的用量数据通过 REST API 获取 |

建议采用方案 A，简化认证逻辑。

**优先级**: 中

---

### 问题 18: PATCH/GET/DELETE /api/v1/pats/:id 响应格式缺失

**问题**: §3.3 只定义了 POST 响应，PATCH/GET/DELETE 端点缺少响应格式

**建议补充**:

| 端点 | 响应 |
|------|------|
| GET /pats/:id | `{ id, name, token_prefix, scopes, expires_at, last_used_at, created_at }` (不含明文) |
| PATCH /pats/:id | 同上（部分字段更新后返回） |
| DELETE /pats/:id | `204 No Content` |

**优先级**: 中

---

### 问题 19: token_prefix 唯一性未在表定义体现

**问题**: §3.1 表定义中只定义了 `uq_pat_hash` 唯一约束，`token_prefix` 无约束

**说明**: Q2 已提出此问题，需确认是否需要全局唯一后再决定是否补充 UNIQUE 约束

**优先级**: 低（待 Q2 确认后处理）

---

### 问题 20: VK 禁用/删除后的认证失效机制

**问题**: VK 被禁用或删除后，MCP Server 缓存的 VK 认证如何失效？

**建议**:
- MCP Server 不缓存 VK 认证，每次请求实时验证
- 或后端提供 VK 状态查询 API，MCP Server 定期同步

**优先级**: 高

---

### 问题 21: 架构图 Manager Tools 数量标注错误

**问题**: §2 架构图标注"Manager Tools (16)"，但 §5.3 只列出 12 个管理者专属工具

**说明**: 4 个共享工具对两模式都可用，不应计入 Manager 专属

**建议**: 架构图修改为"Manager Tools (12)"

**优先级**: 低

---

### 问题 22: scopes → 端点映射不完整

**问题**: §3.4 说"检查 scopes 是否包含当前操作所需的权限"，但未定义具体映射

**建议补充**:

| 端点 | 所需最小 Scope |
|------|--------------|
| GET /pats | read |
| POST /pats | write |
| GET /pats/:id | read |
| PATCH /pats/:id | write |
| DELETE /pats/:id | write |
| 其他管理端点 | 参照 §3.4 映射表 |

**优先级**: 中

---

### 问题 23: VK status 值和删除状态关系未定义

**问题**: §4.3 只说了 `'active'` 和 `deleted_at`，未定义完整的状态模型

**建议明确**:

1. `status` 可选值：`'active'` | `'disabled'` | `'expired'`
2. `deleted_at IS NOT NULL` 表示已删除（软删除）
3. `deleted_at` 和 `status` 关系：已删除的 VK 不论 status 都视为无效

```typescript
// VK 有效条件
const isValidVK = vk.deleted_at === null && vk.status === 'active';
```

**优先级**: 中

---

### 问题 24: VK 认证失败返回 401 还是 403

**问题**: §4.3 未定义 VK 无效时的 HTTP 状态码

**建议统一**:

| 场景 | HTTP 状态码 | 原因 |
|------|-------------|------|
| VK 不存在 | 401 | 认证失败 |
| VK 已禁用 | 401 | 不暴露 VK 存在 |
| VK 已删除 | 401 | 不暴露 VK 存在 |
| VK 已过期 | 401 | 认证失败 |

**注**: 统一返回 401，避免区分具体原因导致信息泄露。

**优先级**: 高

---

### 问题 25: VK 模式描述不准确

**问题**: §2.1 称"成员模式"，但 VK 也可用于管理者查看自己用量

**建议**: 重命名为"只读模式"或"VK 模式"，或补充说明：
- VK 可用于：成员查看自己用量、管理者查看自己用量
- PAT 用于：管理者执行管理操作

**优先级**: 低

---

### 问题 26: allowed_models 在 Cockpit API 中的作用

**问题**: §4.5 scope 响应包含 `allowed_models`，但 Cockpit API 如何处理未定义

**建议明确**:
- Cockpit API 是否过滤掉不允许的模型？
- 还是在所有响应中作为参考信息返回？

**优先级**: 低

---

### 问题 27: PATCH /pats/:id 请求字段未定义

**问题**: §3.3 说"更新名称/过期时间"，但请求字段未定义

**建议补充**:

```json
// PATCH /api/v1/pats/:id
{
  "name"?: string,
  "expires_at"?: string | null
}
```

**优先级**: 中

---

### 问题 28: GET /pats 列表分页格式缺失

**问题**: §3.3 GET /pats 缺少分页参数和响应格式定义

**建议补充**:

| 参数 | 类型 | 说明 |
|------|------|------|
| limit | integer | 每页数量，默认 20 |
| offset | integer | 偏移量，默认 0 |

```json
// GET /api/v1/pats?limit=20&offset=0
{
  "data": [
    { "id": "uuid", "name": "...", "token_prefix": "...", ... }
  ],
  "pagination": { "total": 10, "limit": 20, "offset": 0 }
}
```

**优先级**: 中

---

### 问题 29: POST /pats 请求 workspace_id 来源

**问题**: §3.3 创建 PAT 时，workspace_id 从 JWT 推断还是从请求体获取未明确

**建议**: 明确 workspace_id 来源：
- 从 JWT 的 X-Workspace-Id 获取（推荐）
- 不从请求体获取，避免用户可指定任意工作区

**优先级**: 高

---

### 问题 30: MCP Server PAT 认证后如何获取 workspace_id

**问题**: §5.2 createClient 调用时只传了 PAT，环境变量如何传递 workspace_id？

**建议方案**:

| 方案 | 说明 | 推荐 |
|------|------|------|
| A | 从 PAT 响应解析 workspace_id（需先调一次 API） | ❌ 复杂 |
| B | 环境变量 `ALEPHANT_WORKSPACE_ID` | ✅ 简单 |
| C | 从 PAT token_prefix 解析（需后端 API） | ❌ 不可行 |

建议采用方案 B。

**优先级**: 高

---

### 问题 31: revoked_at 撤销后的错误信息

**问题**: §3.4 说检查 revoked_at，但 VK/PAT 认证失败时返回什么错误信息未定义

**建议**: 统一错误信息：

| 场景 | 错误信息 |
|------|----------|
| Token 已撤销 | "Token has been revoked" |
| Token 已过期 | "Token has expired" |
| Token 无效 | "Authentication failed" |

**优先级**: 中

---

### 问题 32: budget_window 和 budget_action 可选值未定义

**问题**: §4.5 中 budget_status 响应的枚举值未明确定义

**建议补充**:

```typescript
budget_window: "daily" | "weekly" | "monthly" | "yearly"
budget_action: "alert_only" | "block" | "reduce_quota"
```

**优先级**: 低

---

### 问题 33: Collector 认证转发安全性

**问题**: §4.6 说"转发认证头至 Collector"，但安全性未评估

**风险**:
- VK 认证头是否应该转发给 Collector？
- Collector 是否信任来自 backend-saas-service 的请求？
- 是否应该使用服务间认证而非用户 VK？

**建议**:
- 后端内部调用应使用服务间认证（如 API Key）
- VK 认证头只用于识别用户身份，不应直接转发到下游服务

**优先级**: 高

---

### 问题 34: VK prefix 在 scope 响应中的用途

**问题**: §4.5 scope 响应包含 `"prefix": "vk-agent-a3f8..."`，但成员模式下这个信息的用途未说明

**建议**: 明确 prefix 的用途：
- 用于前端展示（用户识别自己的 VK）
- 或仅为兼容性保留

**优先级**: 低

---

### 问题 35: 启动流程注释仍包含 mock

**问题**: §5.2 启动流程代码注释未同步更新

```typescript
// 当前（错误）
const mode = detectAuthMode(process.env);
// → 'member' | 'manager' | 'mock'

// 应改为
// → 'member' | 'manager'
```

**优先级**: 低

---

### 问题 36: 共享工具"管理者后端"未定义

**问题**: §5.3 表中管理者调用 `analytics/*` 端点，但这些 API 未在设计中定义

| 工具 | 管理者后端 | 状态 |
|------|-----------|------|
| `get_usage_summary` | analytics/overview | ❌ 未定义 |
| `get_daily_costs` | analytics/usage | ❌ 未定义 |
| `get_cost_by_model` | analytics/models | ❌ 未定义 |

**建议**:
- 方案 A：复用现有的 analytics API
- 方案 B：在 PAT 系统（开发线 A）中新增这些端点
- 方案 C：管理者调用 Cockpit API（与 VK 相同）

**优先级**: 高

---

### 问题 37: safeCall 401 错误信息不准确

**问题**: §5.4 中 401 错误提示"Check ALEPHANT_PAT or VIRTUAL_KEY"，但应根据当前模式动态提示

**当前**:
```typescript
"Authentication failed. Check your ALEPHANT_PAT or ALEPHANT_VIRTUAL_KEY."
```

**建议**:
```typescript
// 成员模式
"Authentication failed. Check your ALEPHANT_VIRTUAL_KEY."

// 管理者模式
"Authentication failed. Check your ALEPHANT_PAT."
```

**优先级**: 低

---

### 问题 38: cost_optimization prompt 依赖未定义的 API

**问题**: §5.5 说 prompt 需分析"全工作区成本、模型分布、部门用量"，但这些数据来自未定义的 analytics/* API

**影响**: 若 analytics/* 不实现，cost_optimization prompt 将无法正常工作

**优先级**: 中

---

### 问题 39: model-catalog Resource 数据来源未定义

**问题**: §5.6 说 model-catalog 是"只读引用数据"，但来源是静态配置还是动态 API？

**建议**:
| 方案 | 说明 |
|------|------|
| A | 静态 JSON 文件，随 npm 包发布 |
| B | 动态从 API 获取（需新增 /models 端点） |

建议采用方案 A，避免增加 API 依赖。

**优先级**: 低

---

### 问题 40: usage_pct 类型不一致

**问题**: §4.5 budget-status 响应中 usage_pct 类型不一致

```json
"virtual_key_budget": {
  "usage_pct": 47.23   // 小数
},
"entity_budget": {
  "usage_pct": 25.6   // 小数
}
```

**建议**: 统一为整数（如 47 表示 47%）或统一为小数（如 0.4723）

**优先级**: 低

---

### 问题 41: 集成测试清单缺少测试步骤

**问题**: §6.3 列出了测试场景，但缺少具体测试步骤

**建议补充**:

| 测试场景 | 测试步骤 |
|----------|----------|
| 过期 PAT | 创建 expires_at 为过去时间的 PAT，配置到 MCP Server，调用任意 API |
| 撤销 PAT | 创建 PAT 后调用 DELETE /pats/:id，然后配置到 MCP Server |
| 禁用 VK | 将 VK 的 status 改为 'disabled'，配置到 MCP Server |

**优先级**: 低

---

### 问题 42: X-Alephant-Virtual-Key 头用途不明确

**问题**: §2.1 说成员模式需要同时发送两个头：
- `Authorization: Bearer <vk>`
- `X-Alephant-Virtual-Key`

但为什么需要两个头？只用 Authorization 不够吗？

**可能的原因**:
- 后端中间件可能有多个认证方式，需显式指定
- 兼容旧版设计

**建议**: 明确 `X-Alephant-Virtual-Key` 头的用途，或移除

**优先级**: 中

---

### 问题 43: MCP Server 日志和监控缺失

**问题**: §5 设计中无日志、指标、trace 相关说明

**建议补充**:

| 维度 | 内容 |
|------|------|
| 请求日志 | 工具调用时间、参数、响应状态 |
| 错误追踪 | 错误类型、堆栈、上下文 |
| 性能指标 | 工具调用延迟、后端 API 响应时间 |
| 健康检查 | MCP Server 自身状态 |

**优先级**: 中

---

## 🔴 原设计文档问题（需修复）

以下问题在原设计文档 `docs/2026-03-31-alephant-mcp-dual-mode-design.md` 中，需同步修复：

| # | 问题 | 位置 | 修复建议 |
|---|------|------|----------|
| 1 | Mock 模式未移除 | §2.1 环境变量表 | 移除"都不提供 → Mock 模式"行，改为"报错退出" |
| 2 | mock-client.ts 未移除 | §5.1 项目结构 | 删除该文件引用 |
| 3 | `detector.ts` 注释未更新 | §5.1 | "VK / PAT / Mock" → "VK / PAT" |
| 4 | `cost_cents` 类型不一致 | §4.5 recent-requests | `4.2` → `4`（统一为整数） |
| 5 | `expires_at` 语义未定义 | §3.1 要点 | 补充：`NULL` 表示永不过期 |
| 6 | 多工作区切换未说明 | §3.5 | 补充：用户需为每个工作区创建独立 PAT |
| 7 | 集成测试清单未更新 | §6.3 | 移除"无凭证 → Mock 模式"测试项 |
| 8 | 开发线图未更新 | §6.2 | "Client 层 (mock)" → "Client 层" |
| 9 | 开工前置未更新 | §6.1 | 移除"Mock 数据约定" |
| 10 | 管理者工具 API 端点契约缺失 | §5.3 vs §3 | 12 个管理工具的 REST API 未定义 |
| 11 | Cockpit API 降级格式不完整 | §4.4-4.5 | 只有 usage-summary 定义了降级格式，其他端点未定义 |
| 12 | 工具参数类型未定义 | §5.3 | budget_cents, rate_limit_rpm 等缺少类型和约束 |
| 13 | PATCH/GET/DELETE /pats/:id 响应缺失 | §3.3 | 只定义了 POST 响应 |
| 14 | 架构图 Manager Tools 数量标注错误 | §2 | "(16)" 应改为 "(12)" |
| 15 | cost-by-model 响应缺少 period | §4.5 | 需与 usage-summary/daily-costs 保持一致 |
| 16 | recent-requests status 值未定义 | §4.5 | 需补充可选值定义 |
| 17 | scopes → 端点映射未定义 | §3.4 | 需补充各端点所需最小 scope |
| 18 | VK status 值和删除状态关系未定义 | §4.3 | 需定义完整的状态模型 |
| 19 | VK 认证失败返回 401 还是 403 未定义 | §4.3 | 统一返回 401 |
| 20 | VK 模式描述不准确 | §2.1 | "成员模式"可改为"只读模式" |
| 21 | PATCH /pats/:id 请求字段未定义 | §3.3 | 需补充 name, expires_at 字段 |
| 22 | GET /pats 列表分页格式缺失 | §3.3 | 需补充分页参数和响应格式 |
| 23 | allowed_models 在 Cockpit API 中的作用未定义 | §4.5 | 需明确是否过滤模型 |
| 24 | POST /pats workspace_id 来源未明确 | §3.3 | 建议从 JWT 获取 |
| 25 | MCP Server PAT 模式缺少 workspace_id 环境变量 | §5.2 | 建议添加 ALEPHANT_WORKSPACE_ID |
| 26 | 撤销后的错误信息未定义 | §3.4/§4.3 | 需补充错误信息规范 |
| 27 | mock-client.ts 仍在项目结构中 | §5.1 | 第 398 行需删除 |
| 28 | budget_window/budget_action 可选值未定义 | §4.5 | 需补充枚举值 |
| 29 | 启动流程注释仍包含 mock | §5.2 | `// → 'member' | 'manager' | 'mock'` 需更新 |
| 30 | safeCall 401 错误信息不准确 | §5.4 | 应根据模式动态提示 |
| 31 | cost_optimization prompt 依赖未定义的 API | §5.5 | analytics/* 未定义 |
| 32 | 管理者模式配置缺少 workspace_id | §5.7 | 需添加 ALEPHANT_WORKSPACE_ID |
| 33 | usage_pct 类型不一致 | §4.5 | 47.23 vs 25.6 需统一 |
| 34 | 集成测试清单缺少测试步骤 | §6.3 | 需补充如何制造过期/撤销状态 |
| 35 | X-Alephant-Virtual-Key 头用途不明确 | §2.1 | 需说明为何需要两个头 |
| 36 | MCP Server 日志和监控缺失 | §5 | 需补充日志、指标设计 |

---

## 🔍 需要澄清的问题

| # | 问题 | 影响 | Owner | 截止日期 | 状态 |
|---|------|------|-------|----------|------|
| Q1 | Cockpit API 的 `period=billing_cycle` 如何定义周期起止？是固定每月1日还是用户配置的账单日？ | 影响 usage-summary 准确性 | @backend-saas | 2026-04-07 | 待确认 |
| Q2 | PAT 的 `token_prefix` 是否需要全局唯一（跨工作区）？ | 安全考量 | @backend-saas | 2026-04-07 | 待确认 |
| Q3 | VK 的 `last_used_at` 迁移是否已纳入开发线 B 的 backlog？ | §4.3 提到但未确认 | @backend-saas | 2026-04-07 | 待确认 |
| Q5 | `list_available_models` 的模型列表数据来源？是静态配置还是动态从 Provider 获取？ | 影响实现方式 | @alephant-mcp | 2026-04-07 | 待确认 |
| Q6 | Cockpit API 是否保留 mock-client.ts？ | 开发线 C 实现方式 | @alephant-mcp | 2026-04-07 | ✅ 已确认移除 |
| Q7 | `expires_at IS NULL` 语义：null 是永不过期还是未设置？ | §3.4 语义不明确 | @backend-saas | 2026-04-07 | 待确认 |
| Q8 | Cockpit API `cost_cents` 类型是否统一？建议统一为整数（分） | §4.5 类型不一致 | @backend-saas | 2026-04-07 | 待确认 |
| Q9 | PAT 模式下是否支持调用 Cockpit API？ | §3 vs §4 方案待定 | @backend-saas | 2026-04-07 | 待确认 |
| Q10 | VK 数据隔离边界：能否跨 entity 查询？ | §4.2 安全边界 | @backend-saas | 2026-04-07 | 待确认 |

---

## 📊 风险评估

| 风险项 | 等级 | 概率 | 缓解措施 |
|--------|------|------|----------|
| 三线并行 API 契约不一致 | 中 | 中 | 开工前锁定契约（§6.1 已列出 ✅） |
| PAT 系统安全性漏洞 | 高 | 低 | SHA-256 哈希 + 一次性明文展示（设计正确） |
| MCP Server 与后端版本不兼容 | 中 | 中 | 添加 API 版本协商机制 |
| Collector 单点故障导致数据不可用 | 中 | 中 | 降级响应已设计，需实现 + 测试 |
| AI 助手频繁调用导致 API 超限 | 低 | 中 | 添加 MCP Server 端限流 |

---

## 📝 补充建议

### 1. API 版本策略

建议响应头添加标准版本标识：

```
X-API-Version: 2026-03-31
X-Request-Id: <uuid>
```

### 2. 日志规范

Cockpit API 应记录请求链路：

```json
{
  "timestamp": "2026-04-01T10:00:00Z",
  "request_id": "uuid",
  "virtual_key_id": "uuid",
  "endpoint": "/api/v1/cockpit/usage-summary",
  "latency_ms": 45,
  "status": 200
}
```

### 3. 测试策略

建议添加 MCP Inspector YAML 测试用例：

```yaml
# tests/mcp-inspector/usage-summary.yaml
test:
  name: get_usage_summary
  tool: get_usage_summary
  input:
    period: 7d
  expected:
    status: success
    contains:
      - total_requests
      - total_cost_cents
```

### 4. 文档维护

建议创建 API changelog：

```
docs/
├── CHANGELOG-api.md
└── versions/
    └── 2026-03-31.md
```

---

## 📈 建议的后续行动

### 高优先级 (立即处理)

- [ ] 明确 PAT Token 格式规范
- [ ] 补充完整错误处理（429/504/超时）
- [ ] 定义降级响应标准格式
- [ ] 同步原设计文档 Mock 移除后的修改 (§6.1/6.2/6.3)
- [ ] 实现 PAT 创建时的 workspace 权限验证
- [ ] 实现认证缓存失效机制（VK 和 PAT）
- [ ] 定义 12 个管理者工具的 REST API 端点契约
- [ ] 修复架构图 Manager Tools 数量 "(16)" → "(12)"
- [ ] 定义 VK 认证失败统一返回 401 (问题 24)
- [ ] 明确 POST /pats workspace_id 来源 (问题 29)
- [ ] 添加 ALEPHANT_WORKSPACE_ID 环境变量 (问题 30)

### 中优先级 (开发前确认)

- [ ] 确认 billing_cycle 定义逻辑 (Q1)
- [ ] 确认 token_prefix 唯一性要求 (Q2)
- [ ] 添加 Health Check 端点
- [ ] 确认模型列表数据来源 (Q5)
- [ ] 移除 mock-client.ts (Q6)
- [ ] 确认 expires_at NULL 语义 (Q7)
- [ ] 统一 cost_cents 为整数类型 (Q8)
- [ ] 确认 PAT 是否支持调用 Cockpit API (Q9)
- [ ] 明确 VK 数据隔离边界 (Q10)
- [ ] 补充 PAT 端点响应格式 (PATCH/GET/DELETE)
- [ ] 补充 cost-by-model 响应的 period 字段
- [ ] 补充 recent-requests 的 status 可选值定义
- [ ] 补充所有 Cockpit 端点的降级格式
- [ ] 补充工具参数类型定义
- [ ] 补充 scopes → 端点映射表 (问题 22)
- [ ] 定义 VK status 值和删除状态关系 (问题 23)
- [ ] 补充 PATCH /pats/:id 请求字段定义 (问题 27)
- [ ] 补充 GET /pats 列表分页格式 (问题 28)
- [ ] 定义撤销后的错误信息规范 (问题 31)
- [ ] 评估 Collector 认证转发安全性 (问题 33)
- [ ] 定义共享工具的管理者后端 API (问题 36)
- [ ] 修复启动流程注释 mock (问题 35)
- [ ] 确认 cost_optimization prompt 依赖 (问题 38)
- [ ] 确认 model-catalog 数据来源 (问题 39)

### 低优先级 (预防性设计)

- [ ] VK Token 版本管理机制
- [ ] MCP Server 请求限流
- [ ] API 版本协商协议
- [ ] 补充 budget_window/budget_action 枚举值 (问题 32)
- [ ] 明确 VK prefix 在 scope 响应中的用途 (问题 34)
- [ ] 统一 usage_pct 类型 (问题 40)
- [ ] 补充集成测试步骤 (问题 41)
- [ ] 明确 X-Alephant-Virtual-Key 头用途 (问题 42)
- [ ] 补充 MCP Server 日志和监控设计 (问题 43)

---

## 总结

| 维度 | 评估 |
|------|------|
| **完整性** | ⭐⭐⭐⭐ 文档结构完整，覆盖设计、开发、测试全流程 |
| **可行性** | ⭐⭐⭐⭐⭐ 三线解耦设计可行，契约联调策略合理 |
| **安全性** | ⭐⭐⭐⭐ PAT 设计正确，Token 格式需明确 |
| **健壮性** | ⭐⭐⭐⭐ 降级策略已设计并明确格式定义 |
| **可维护性** | ⭐⭐⭐⭐ 工具集清晰，错误处理已完善 |

**总体评价**: 该设计文档架构清晰，方案可行。建议进入开发线 A/B/C 的详细设计阶段，同时处理上述高优先级问题。

---

*分析人: opencode*  
*审查日期: 2026-04-01*
