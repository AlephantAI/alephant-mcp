# 在 AI Agent 中使用 Alephant MCP（中文指南）

本文说明如何在 Cursor、Codex、OpenCode、Claude Code、Claude Desktop 等 **MCP 宿主**里，通过 **自然语言** 让助手调用 **Alephant MCP** 的工具与 Prompt，并给出可复制的 **快捷话术模板**（含 `/` 前缀写法）。

---

## 1. 前置条件

1. 已在宿主中配置 Alephant MCP（见仓库根目录 [README.md](../../README.md) 的 JSON 示例）。
2. 环境变量正确：
   - **VK 模式**：`ALEPHANT_API_BASE_URL` + `ALEPHANT_VIRTUAL_KEY`
   - **Manager 模式**：`ALEPHANT_API_BASE_URL` + `ALEPHANT_PAT` + `ALEPHANT_WORKSPACE_ID`
3. MCP 连接成功后，对话里助手侧应能看到以 `get_usage_summary`、`list_virtual_keys` 等为名的工具（具体名称因模式而异）。

> **关于「/ 调用」**：MCP 协议本身不提供聊天框里的「斜杠命令」注册。下面的 **`/alephant-…`** 模板是**建议你发给 Agent 的整句前缀**，便于记忆、检索历史记录；宿主仍通过自然语言理解后 **自动选用 MCP 工具**。

---

## 2. 常见客户端配置

所有客户端都启动同一个本地 stdio server：`npx -y @alephantai/mcp`。VK 模式配置 `ALEPHANT_VIRTUAL_KEY`；Manager 模式配置 `ALEPHANT_PAT` + `ALEPHANT_WORKSPACE_ID`。多工作区请配置多个不同名称的 server。

### 2.1 Cursor / Claude Desktop

```json
{
  "mcpServers": {
    "alephant": {
      "command": "npx",
      "args": ["-y", "@alephantai/mcp"],
      "env": {
        "ALEPHANT_API_BASE_URL": "https://api.alephant.ai",
        "ALEPHANT_VIRTUAL_KEY": "vk-..."
      }
    }
  }
}
```

Manager 模式把 `ALEPHANT_VIRTUAL_KEY` 替换为：

```json
{
  "ALEPHANT_PAT": "pat_...",
  "ALEPHANT_WORKSPACE_ID": "00000000-0000-0000-0000-000000000000"
}
```

### 2.2 Codex

在 `~/.codex/config.toml` 中添加：

```toml
[mcp_servers.alephant]
command = "npx"
args = ["-y", "@alephantai/mcp"]
env = {
  ALEPHANT_API_BASE_URL = "https://api.alephant.ai",
  ALEPHANT_VIRTUAL_KEY = "vk-..."
}
startup_timeout_sec = 20
tool_timeout_sec = 120
```

验证：

```bash
codex mcp list
codex mcp get alephant
```

### 2.3 OpenCode

在 OpenCode 配置（例如 `opencode.json`）中添加：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "alephant": {
      "type": "local",
      "command": ["npx", "-y", "@alephantai/mcp"],
      "enabled": true,
      "environment": {
        "ALEPHANT_API_BASE_URL": "https://api.alephant.ai",
        "ALEPHANT_VIRTUAL_KEY": "vk-..."
      }
    }
  }
}
```

### 2.4 Claude Code

个人配置可用 CLI：

```bash
claude mcp add-json alephant '{"type":"stdio","command":"npx","args":["-y","@alephantai/mcp"],"env":{"ALEPHANT_API_BASE_URL":"https://api.alephant.ai","ALEPHANT_VIRTUAL_KEY":"vk-..."}}' --scope user
claude mcp list
```

项目共享配置可用项目根目录 `.mcp.json`：

```json
{
  "mcpServers": {
    "alephant": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@alephantai/mcp"],
      "env": {
        "ALEPHANT_API_BASE_URL": "https://api.alephant.ai",
        "ALEPHANT_VIRTUAL_KEY": "vk-..."
      }
    }
  }
}
```

---

## 3. 两种模式能做什么

| 能力 | VK 模式 | Manager 模式 |
|------|---------|--------------|
| 连接与凭证诊断 | ✅ | ✅ |
| 用量汇总 / 按日成本 / 按模型成本 | ✅ | ✅ |
| 可用模型列表 | ✅ | ✅ |
| 当前密钥作用域、预算、最近请求 | ✅ | — |
| 工作区概览、预算状态、虚拟密钥 CRUD、成员/部门/Agent 列表与统计 | — | ✅ |
| 订阅信息、工作区级预算策略 | — | ✅ |
| Prompt：`cost_audit_report` | ✅ | ✅ |
| Prompt：`cost_optimization` | — | ✅ |

---

## 4. 自然语言怎么问（原则）

1. **说清楚对象**：「这把虚拟密钥」「当前工作区」「某个 Agent（可贴 UUID）」「工程部对应的部门」。
2. **说清楚时间窗**：如「最近 24 小时」「近 7 天」「近 30 天」「本账期 / billing cycle」（与工具参数 `24h` / `7d` / `30d` / `billing_cycle` 对应）。
3. **写操作要明确**：创建/改预算/撤销密钥、把工作区预算策略改成仅告警或拦截等——助手应调用对应 MCP 工具，而不是编造结果。
4. **审计/报告**：直接说「生成周报/月报/季报成本审计」，并提醒助手使用 MCP **Prompt** `cost_audit_report`（由宿主暴露为 prompt 时）。

若助手未调用 MCP，可补充一句：**「请使用已启用的 Alephant MCP 工具查询，不要猜测。」**

---

## 5. `/` 快捷模板列表（复制即用）

使用时把 `{…}` 换成真实值；可整条复制到 Agent 输入框。

### 5.1 用量与成本（两种模式共有，部分参数 VK/Manager 后端不同）

| 模板 | 说明 |
|------|------|
| `/alephant-health 检查 MCP 是否连上 Alephant` | → `check_alephant_connection` |
| `/alephant-usage 查一下本账期用量汇总` | → `get_usage_summary`，`period=billing_cycle` |
| `/alephant-usage 近7天总消耗和趋势` | → `get_usage_summary` + `get_daily_costs`，`period=7d` |
| `/alephant-usage 最近30天按模型花了多少钱` | → `get_cost_by_model`，`period=30d` |
| `/alephant-models 列出当前账号可用的模型` | → `list_available_models` |

### 5.2 VK 模式专用

| 模板 | 说明 |
|------|------|
| `/alephant-vk 我当前这把密钥绑定的作用域是什么` | → `get_my_scope` |
| `/alephant-vk 本账期预算还剩多少` | → `get_my_budget` |
| `/alephant-vk 最近20条请求摘要` | → `get_my_recent_requests` |

### 5.3 Manager 模式专用

| 模板 | 说明 |
|------|------|
| `/alephant-mgr 工作区概览：成员、Agent、密钥数量等` | → `get_workspace_overview` |
| `/alephant-mgr 当前工作区预算风险` | → `get_workspace_budget_status` |
| `/alephant-mgr 列出所有虚拟密钥及预算` | → `list_virtual_keys` |
| `/alephant-mgr 列出所有成员` | → `list_members` |
| `/alephant-mgr 列出所有部门` | → `list_departments` |
| `/alephant-mgr 部门 {department-uuid} 近30天分析` | → `get_department_analytics` |
| `/alephant-mgr 列出 Agent，可按部门 {department-uuid} 过滤` | → `list_agents`（可选 `department_id`） |
| `/alephant-mgr Agent {agent-uuid} 近7天消耗` | → `get_agent_analytics` |
| `/alephant-mgr 当前订阅与周期信息` | → `get_subscription_info` |
| `/alephant-mgr 把工作区预算策略设为金额 {美分}，超出后仅告警` | → `set_budget_policy`，`action=alert_only` |
| `/alephant-mgr 把工作区预算策略设为金额 {美分}，超出后拦截` | → `set_budget_policy`，`action=block` |

创建/修改/撤销虚拟密钥时，请在对话里给出 **label、master_key_id（UUID）、budget（美元或说明由你换算为美分）、rate_limit_rpm** 等，便于助手调用 `create_virtual_key` / `update_key_budget` / `revoke_virtual_key`。

### 5.4 Prompt（审计与优化）

| 模板 | 说明 |
|------|------|
| `/alephant-audit 生成周报成本审计` | → MCP Prompt `cost_audit_report`，`period=weekly` |
| `/alephant-audit 月报` | → `period=monthly` |
| `/alephant-audit 季报` | → `period=quarterly` |
| `/alephant-optimize 根据当前数据给成本优化建议` | → `cost_optimization`（**仅 Manager**） |

---

## 6. 与工具名的对照（供进阶用户）

自然语言不必背工具名；若宿主展示原始名称，可对照下表：

**共用：** `check_alephant_connection`，`get_usage_summary`，`get_daily_costs`，`get_cost_by_model`，`list_available_models`  

**VK：** `get_my_scope`，`get_my_budget`，`get_my_recent_requests`  

**Manager：** `get_workspace_overview`，`get_workspace_budget_status`，`list_virtual_keys`，`create_virtual_key`，`update_key_budget`，`revoke_virtual_key`，`list_agents`，`get_agent_analytics`，`list_members`，`get_member_analytics`，`list_departments`，`get_department_analytics`，`get_subscription_info`，`set_budget_policy`，`get_live_24h`，`get_usage_timeseries`，`get_sparklines`，`diagnose_cost_anomaly`，`get_executive_dashboard`，`drill_down_spend`，`find_idle_resources`，`compare_entity_periods`  

**Prompt：** `cost_audit_report`，`cost_optimization`（Manager）

---

## 7. 常见问题

**工具报错或没有 Alephant 工具**  
检查 MCP 配置、环境变量、网络与 `ALEPHANT_API_BASE_URL`；VK 与 PAT 不要混用预期（PAT 非空时会走 Manager 模式）。

**希望像「命令面板」一样用 /**  
可把本节 **§5** 收藏为片段，或安装仓库内 **`skills/alephant-mcp-usage/SKILL.md`** 到 Cursor 的 `.cursor/skills/`，让助手稳定优先走 Alephant MCP。

**需要图表、多工作区切换**  
聊天适合单次查询；持续看图建议打开产品内 **Alephant Cockpit**。

---

## 8. 相关文件

- 英文总览：[README.md](../../README.md)
- Cursor Skill（复制到项目的 `.cursor/skills/alephant-mcp-usage/`）：[skills/alephant-mcp-usage/SKILL.md](../../skills/alephant-mcp-usage/SKILL.md)
