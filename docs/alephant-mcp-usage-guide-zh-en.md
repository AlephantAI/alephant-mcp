# Alephant MCP 使用指南（中英对照）

# Alephant MCP Usage Guide (Chinese & English)

本文档说明如何在 **Cursor、Claude Desktop、VS Code（MCP 扩展）** 等宿主中**导入与配置** Alephant MCP、如何用**自然语言与 Agent** 驱动工具，以及 **Virtual Key（VK）模式**与 **Manager（管理者 / PAT）模式**的差异。

This guide covers how to **import and configure** the Alephant MCP in hosts such as **Cursor, Claude Desktop, and VS Code (MCP extension)**, how to drive tools via **natural language and agents**, and how **Virtual Key (VK)** mode differs from **Manager (PAT)** mode.

---

## 1. 环境与常用工具导入配置 · Environment & tool import configuration

### 1.1 必填 / 可选环境变量 · Required / optional environment variables


| 变量 · Variable             | 必填 · Required             | 说明 · Description                                                                          |
| ------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| `ALEPHANT_API_BASE_URL`   | 是 · Yes                   | SaaS API 根地址，勿尾斜杠 · Base URL of the SaaS API (no trailing slash required).                |
| `ALEPHANT_VIRTUAL_KEY`    | VK 模式二选一 · One of VK pair | 虚拟密钥，**单把密钥对应的 Cockpit 只读范围** · Virtual key; **read-only, scoped to that key’s cockpit**. |
| `ALEPHANT_PAT`            | Manager 模式 · Manager      | 个人访问令牌 · Personal Access Token.                                                           |
| `ALEPHANT_WORKSPACE_ID`   | 与 PAT 同时 · With PAT       | 工作区 UUID · Workspace UUID.                                                                |
| `ALEPHANT_RATE_LIMIT_RPM` | 否 · No                    | 客户端每分钟 HTTP 调用上限，默认 `60`；`0` 关闭 · Client-side calls/min, default `60`; `0` disables.      |


**模式判定 · Mode detection：** 若 `ALEPHANT_PAT` 非空（trim 后），**始终为 Manager**；否则若设置了 `ALEPHANT_VIRTUAL_KEY` 则为 **VK**。两者都未配置时进程**报错退出**（无 Mock）。  
**Mode rule:** If `ALEPHANT_PAT` is non-empty after trim, **always Manager**; else if `ALEPHANT_VIRTUAL_KEY` is set, **VK**. If neither is set, the server **exits with an error** (no mock data).

---

### 1.2 Cursor：图形界面添加 MCP · Cursor: UI

**中文**

1. 打开 **设置 → Features → MCP**。
2. **Add New MCP Server**。
3. **Type**：`command`。
4. **Command**：`npx`（或见下文 `args` 写法）。
5. **Args**：`-y`、`@alephantai/mcp`（分两格）。
6. 在 **Environment variables** 中填入上表变量（VK 或 Manager 二选一组合）。
7. 保存至指示灯为绿色。

**English**

1. Open **Settings → Features → MCP**.
2. **Add New MCP Server**.
3. **Type**: `command`.
4. **Command**: `npx` (or use the JSON form below with `args`).
5. **Args**: `-y`, `@alephantai/mcp` (two separate entries).
6. Add the env vars from the table (VK **or** Manager set).
7. Save until the status indicator is green.

---

### 1.3 常用配置片段：`mcp.json` · Common config: `mcp.json`

宿主通常使用项目级或用户级 MCP 配置（例如 Cursor 的 `mcp.json`）。下面为**最常用**的两种条目：**VK 只读**与 **Manager 全量管理**。

Hosts usually read project-level or user-level MCP config (e.g. Cursor `mcp.json`). Below are the two most common entries: **VK (read-only)** and **Manager (full workspace)**.

**Virtual Key（VK）— 单密钥 Cockpit，只读**

```json
{
  "mcpServers": {
    "alephant": {
      "command": "npx",
      "args": ["-y", "@alephantai/mcp"],
      "env": {
        "ALEPHANT_API_BASE_URL": "https://api.alephant.ai",
        "ALEPHANT_VIRTUAL_KEY": "vk-your-key-here"
      }
    }
  }
}
```

**Manager（管理者）— PAT + 工作区 ID**

```json
{
  "mcpServers": {
    "alephant-workspace-a": {
      "command": "npx",
      "args": ["-y", "@alephantai/mcp"],
      "env": {
        "ALEPHANT_API_BASE_URL": "https://api.alephant.ai",
        "ALEPHANT_PAT": "pat_your_token_here",
        "ALEPHANT_WORKSPACE_ID": "00000000-0000-0000-0000-000000000000"
      }
    }
  }
}
```

- **多工作区 · Multiple workspaces:** 为每个 PAT/工作区复制一条 `mcpServers` 条目，**名称互不相同**（如 `alephant-workspace-a`、`alephant-workspace-b`）。  
- **npx 备选 · npx alternative:** 若 `-y @alephantai/mcp` 解析异常，可尝试：  
`npx --yes --package=@alephantai/mcp alephant-mcp`  
- **可选节流 · Optional throttling:** 在 `env` 中加入 `"ALEPHANT_RATE_LIMIT_RPM": "60"` 或 `"0"`。

---

### 1.4 本地开发（克隆仓库时）· Local dev (from clone)

在 `**alephant-mcp` 仓库根目录**内不要用 `npx -y @alephantai/mcp` 做冒烟测试（npm 会把当前目录当作包根，Windows 上常见 bin 解析失败）。请从**上级目录**执行 npx，或使用：

Do not run `npx -y @alephantai/mcp` **from the `alephant-mcp` repo root** for smoke tests. Run npx from a **parent folder**, or use:

```bash
npm start
# or
node ./bin/alephant-mcp.js
```

配置里可把 `command` 改为 `node`，`args` 指向本地 `bin/alephant-mcp.js`，并保留相同 `env`。

For local wiring, point `command` to `node` and `args` to `./bin/alephant-mcp.js` with the same `env`.

---

### 1.5 全局安装（可选）· Global install (optional)

```bash
npm install -g @alephantai/mcp
```

之后在配置中可将 `command` 设为 `alephant-mcp`（视 PATH 而定），仍建议为每个服务器保留完整 `env`。

You may then set `command` to `alephant-mcp` if it is on `PATH`; keep full `env` per server entry.

---

## 2. 自然语言与 Agent 使用方式 · Natural language & Agent usage

### 2.1 原则 · Principles

**中文**

1. **说清对象**：当前虚拟密钥、工作区、某个 Agent（可贴 UUID）、部门。
2. **说清时间窗**：如「最近 24 小时 / 7 天 / 30 天 / 本账期」，对应工具参数 `24h`、`7d`、`30d`、`billing_cycle`。
3. **写操作要明确**：创建/改预算/撤销密钥、修改工作区预算策略（告警 vs 拦截）— 要求助手调用对应工具，而非编造。
4. 若模型未调用 MCP，可明确说：**「请使用已启用的 Alephant MCP 工具查询，不要猜测。」**

**English**

1. **Name the scope**: this virtual key, the workspace, a specific agent (UUID), or a department.
2. **Name the window**: e.g. last 24h / 7d / 30d / billing cycle → `24h`, `7d`, `30d`, `billing_cycle`.
3. **Be explicit for writes**: create/update/revoke keys, workspace budget policy (alert vs block)— insist the agent **calls the tool**, not hallucinates.
4. If the model skips MCP, say: **“Use the enabled Alephant MCP tools; do not guess.”**

---

### 2.2 自然语言示例 · Example prompts


| 意图 · Intent          | 中文示例 · ZH          | English example                                     |
| -------------------- | ------------------ | --------------------------------------------------- |
| 用量汇总 · Usage summary | 「查一下本账期用量汇总。」      | “Show usage summary for the current billing cycle.” |
| 趋势 · Trends          | 「近 7 天每日消耗趋势。」     | “Daily cost trend for the last 7 days.”             |
| 模型成本 · Cost by model | 「最近 30 天按模型花了多少钱？」 | “Cost by model for the last 30 days.”               |
| VK 作用域 · VK scope    | 「我这把密钥绑定的作用域是什么？」  | “What scope is my virtual key bound to?”            |
| 预算 · Budget (VK)     | 「本账期预算还剩多少？」       | “How much budget is left this billing cycle?”       |
| 管理 · Management      | 「列出所有虚拟密钥和预算。」     | “List all virtual keys and their budgets.”          |
| 审计 · Audit           | 「生成一份周报成本审计。」      | “Generate a weekly cost audit report.”              |


---

### 2.3 「/」快捷话术模板（发给 Agent 的整句前缀）· `/` phrase templates

MCP 协议**不会**在聊天框注册真正的斜杠命令；下列 `**/alephant-…`** 是便于你复制、检索历史的**建议前缀**，宿主仍通过自然语言调度工具。

MCP does **not** register slash commands; `**/alephant-…`** lines are **suggested prefixes** you paste into the agent chat.

**用量与成本（两模式共有 · Both modes**


| 模板 · Template                   | 映射工具 · Maps to                                 |
| ------------------------------- | ---------------------------------------------- |
| `/alephant-usage 查一下本账期用量汇总`    | `get_usage_summary` · `period=billing_cycle`   |
| `/alephant-usage 近7天总消耗和趋势`     | `get_usage_summary` + `get_daily_costs` · `7d` |
| `/alephant-usage 最近30天按模型花了多少钱` | `get_cost_by_model` · `30d`                    |
| `/alephant-models 列出当前可用的模型`    | `list_available_models`                        |


**仅 VK · VK only**


| 模板 · Template                     | 映射工具 · Maps to           |
| --------------------------------- | ------------------------ |
| `/alephant-vk 我当前这把密钥绑定的作用域是什么`   | `get_my_scope`           |
| `/alephant-vk 本账期预算还剩多少`          | `get_my_budget`          |
| `/alephant-vk 最近20条请求摘要（暂不提供-占位）` | `get_my_recent_requests` |


**仅 Manager · Manager only**


| 模板 · Template                            | 映射工具 · Maps to                            |
| ---------------------------------------- | ----------------------------------------- |
| `/alephant-mgr 工作区概览`                    | `get_workspace_overview`                  |
| `/alephant-mgr 列出所有虚拟密钥及预算`              | `list_virtual_keys`                       |
| `/alephant-mgr 列出所有部门`                   | `list_departments`                        |
| `/alephant-mgr 部门 {uuid} 近30天分析`         | `get_department_analytics`                |
| `/alephant-mgr 列出 Agent（可按部门 {uuid} 过滤）` | `list_agents`                             |
| `/alephant-mgr Agent {uuid} 近7天消耗`       | `get_agent_analytics`                     |
| `/alephant-mgr 当前订阅与周期信息`                | `get_subscription_info`                   |
| `/alephant-mgr 工作区预算策略：金额 {美分}，超出仅告警`    | `set_budget_policy` · `action=alert_only` |
| `/alephant-mgr 工作区预算策略：金额 {美分}，超出拦截`     | `set_budget_policy` · `action=block`      |


创建/更新/撤销虚拟密钥时，在对话中提供 `**label`、`master_key_id`（UUID）、`budget_cents`（美分）、`rate_limit_rpm`** 等，便于调用 `create_virtual_key` / `update_key_budget` / `revoke_virtual_key`。

For key CRUD, supply `**label`, `master_key_id` (UUID), `budget_cents`, `rate_limit_rpm**` in the chat.

---

### 2.4 MCP Prompts（审计与优化）· MCP Prompts (audit & optimization)


| Prompt 名称 · Name    | 模式 · Mode     | 中文说明 · ZH   | English                                      |
| ------------------- | ------------- | ----------- | -------------------------------------------- |
| `cost_audit_report` | VK + Manager  | 周/月/季成本审计报告 | Weekly / monthly / quarterly cost audit      |
| `cost_optimization` | **仅 Manager** | 基于数据的成本优化建议 | Cost optimization suggestions (manager only) |


在支持 **Prompts** 的宿主中，可直接请求：“运行 Alephant 的 `cost_audit_report`，周期选 weekly。”

In hosts that expose **prompts**, ask: “Run Alephant `cost_audit_report` with period weekly.”

---

### 2.5 Agent（Cursor 等）协作提示 · Agent collaboration tips

- 将本文件或仓库内 `**docs/zh-CN/agent-mcp-usage.md`** 加入上下文，可减少工具漏调。  
- 工作区规则中可提示：涉及预算、消耗、虚拟密钥、部门/Agent 分析时**优先**使用 Alephant MCP。  
- 需要图表、长时间看板时，使用产品内 **Alephant Cockpit** 更合适。
- Add this doc or `**docs/zh-CN/agent-mcp-usage.md`** to context to reduce missed tool calls.  
- In project rules, state: for budget/spend/VK/dept/agent analytics, **prefer** Alephant MCP.  
- For charts and persistent dashboards, use **Alephant Cockpit**.

---

## 3. VK 模式与 Manager（管理者）模式 · VK vs Manager mode

### 3.1 对比总表 · Comparison


| 维度 · Aspect         | VK（Virtual Key）             | Manager（PAT + Workspace）                 |
| ------------------- | --------------------------- | ---------------------------------------- |
| 认证 · Auth           | `ALEPHANT_VIRTUAL_KEY`      | `ALEPHANT_PAT` + `ALEPHANT_WORKSPACE_ID` |
| 权限 · Permissions    | **只读**，范围限于**该密钥的 Cockpit** | **工作区级**管理与分析（含写操作）                      |
| 工具数量 · Tool count   | 7（含共用工具）                    | 15（含共用工具）                                |
| 典型用户 · Typical user | 开发者、单密钥使用者                  | 管理员、FinOps、Owner                         |


**再次强调 · Reminder:** `ALEPHANT_PAT` 一旦非空，**即使同时配置了 VK**，也会走 **Manager**，不会用 VK 身份。

If `ALEPHANT_PAT` is set, **Manager wins** even if `ALEPHANT_VIRTUAL_KEY` is also set.

---

### 3.2 工具清单 · Tool lists

**共用 · Shared (VK + Manager)**  
`get_usage_summary`，`get_daily_costs`，`get_cost_by_model`，`list_available_models`

**仅 VK · VK only**  
`get_my_scope`，`get_my_budget`，`get_my_recent_requests`

**仅 Manager · Manager only**  
`get_workspace_overview`，`list_virtual_keys`，`create_virtual_key`，`update_key_budget`，`revoke_virtual_key`，`list_agents`，`get_agent_analytics`，`list_departments`，`get_department_analytics`，`get_subscription_info`，`set_budget_policy`

**未包含 · Not included:** `get_request_logs`（后端为 JWT 路由，不在此 MCP 暴露）。  
**Not included:** `get_request_logs` (JWT-only route; not exposed here).

---

### 3.3 CLI 审计（可选）· CLI audit (optional)

```bash
npx --yes --package=@alephantai/mcp alephant-mcp --audit
```

- **VK：** 输出 Cockpit `scope` + 账期 `usage-summary`。  
- **Manager：** 输出工作区 id + `GET /api/v1/analytics/overview` 类概览。
- **VK:** prints cockpit `scope` + billing `usage-summary`.  
- **Manager:** prints workspace id + analytics overview.

---

## 4. 故障排除 · Troubleshooting


| 现象 · Symptom                | 检查 · Check                                                                       |
| --------------------------- | -------------------------------------------------------------------------------- |
| 无 Alephant 工具 · No tools    | MCP 是否启用、`mcp.json` 路径、指示灯是否绿色。                                                  |
| 启动即退出 · Exits on start      | 是否缺少 `ALEPHANT_API_BASE_URL`；VK 与 PAT 是否都未设；Manager 是否缺 `ALEPHANT_WORKSPACE_ID`。 |
| 权限不符合预期 · Wrong permissions | PAT 非空会强制 Manager；确认未在 VK 条目中误配 PAT。                                             |
| 限流 · Rate limit             | 调整 `ALEPHANT_RATE_LIMIT_RPM` 或设为 `0`。                                            |


---

## 5. 相关文档 · Related docs

- [README.md](../README.md)（英文总览 · English overview）  
- [README-ZH.md](../README-ZH.md)（中文速览 · Chinese quickstart）  
- [docs/zh-CN/agent-mcp-usage.md](zh-CN/agent-mcp-usage.md)（中文自然语言与模板详解 · Detailed ZH templates）

---

*文档与 Alephant MCP 行为以仓库当前实现为准；API 地址与域名请替换为你的环境。*  
*Behavior follows the current repo implementation; replace API URLs with your environment.*