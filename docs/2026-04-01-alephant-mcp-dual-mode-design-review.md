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

通过 API 契约解耦，三条线可独立开发、Mock 联调。

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

**建议**:
```typescript
// 统一格式
pat_{workspace_id_prefix}_{32-char-random-hex}
// workspace_id_prefix = workspace_id 前6位（UUID格式：a3f8c2）
// 示例: pat_a3f8c2_e4b7d9f1c0a53e8b2d3e4f5a6b7c8d9
```

**优先级**: 中

---

### 问题 2: 降级响应格式未定义

**当前状态**: §4.6 提到"返回降级响应（零值 + 说明字段）"，但未定义具体格式

**建议**: 在 §4.4 添加标准降级响应格式：

```json
// GET /api/v1/cockpit/usage-summary (降级状态)
{
  "degraded": true,
  "message": "Analytics service unavailable. Showing cached data from 2026-03-31T10:00:00Z.",
  "data": null,
  "fallback_data": {
    "total_requests": 0,
    "total_cost_cents": 0,
    "cached": true
  }
}
```

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
    if (err.status === 429) {
      const retryAfter = err.headers?.['retry-after'] || 60;
      return {
        content: [{ type: "text", text: `Rate limit exceeded. Retry after ${retryAfter} seconds.` }],
        isError: true
      };
    }
    if (err.code === 'ETIMEDOUT') {
      return {
        content: [{ type: "text", text: "Request timeout. Check your network connection or API availability." }],
        isError: true
      };
    }
    // ... 其他错误处理
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

**优先级**: 中

---

### 问题 6: MCP Server 缺少请求限流

**问题**: AI 助手可能频繁调用 MCP 工具，导致 API 超限

**建议**: 在 `base-client.ts` 添加请求队列和限流

```typescript
class RateLimiter {
  private queue: Queue;
  private rpm: number;
  
  async throttle(): Promise<void> {
    // 令牌桶算法实现
  }
}
```

**优先级**: 中

---

## 🔍 需要澄清的问题

| # | 问题 | 影响 | 状态 |
|---|------|------|------|
| Q1 | Cockpit API 的 `period=billing_cycle` 如何定义周期起止？是固定每月1日还是用户配置的账单日？ | 影响 usage-summary 准确性 | 待确认 |
| Q2 | PAT 的 `token_prefix` 是否需要全局唯一（跨工作区）？ | 安全考量 | 待确认 |
| Q3 | VK 的 `last_used_at` 迁移是否已纳入开发线 B 的 backlog？ | §4.3 提到但未确认 | 待确认 |
| Q4 | Mock Client 返回的数据是否需要固定 seed（用于测试幂等性）？ | 便于自动化测试 | 待确认 |
| Q5 | `list_available_models` 的模型列表数据来源？是静态配置还是动态从 Provider 获取？ | 影响实现方式 | 待确认 |

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

### 中优先级 (开发前确认)

- [ ] 确认 billing_cycle 定义逻辑
- [ ] 确认 token_prefix 唯一性要求
- [ ] 确认 Mock Client 固定 seed 需求
- [ ] 添加 Health Check 端点

### 低优先级 (预防性设计)

- [ ] VK Token 版本管理机制
- [ ] MCP Server 请求限流
- [ ] API 版本协商协议

---

## 总结

| 维度 | 评估 |
|------|------|
| **完整性** | ⭐⭐⭐⭐ 文档结构完整，覆盖设计、开发、测试全流程 |
| **可行性** | ⭐⭐⭐⭐⭐ 三线解耦设计可行，Mock 联调策略合理 |
| **安全性** | ⭐⭐⭐⭐ PAT 设计正确，Token 格式需明确 |
| **健壮性** | ⭐⭐⭐ 降级策略已设计但格式未定义 |
| **可维护性** | ⭐⭐⭐⭐ 工具集清晰，错误处理需增强 |

**总体评价**: 该设计文档架构清晰，方案可行。建议进入开发线 A/B/C 的详细设计阶段，同时处理上述高优先级问题。

---

*分析人: opencode*  
*审查日期: 2026-04-01*
