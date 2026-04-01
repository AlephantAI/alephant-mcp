# Track 1：MCP 生态分发设计文档

**日期：** 2026-04-01  
**状态：** 已批准  
**范围：** `alephant-mcp`（Track 1.0）+ `Alephantinterface`（Track 1.2 前端）  
**关联路线图：** `docs/2026-04-01-alephant-mcp-distribution-roadmap.md`

---

## 背景

`alephant-mcp` 是 Alephant BYO-KEY 平台的 TypeScript MCP Server，支持 PAT 模式（管理员）和 VK 模式（开发者）双认证。本文档覆盖从「仓库内测」到「生态可见」的 Track 1 完整实施设计。

**前置条件（阻塞项）：** 双模式架构开发线 A（PAT 系统）+ 开发线 B（Cockpit API）+ 开发线 C（MCP Server **18** 工具）全部完成并通过集成测试，Track 1.0 方可启动。

---

## Track 1.0 — npm 发布 + 目录注册

### 1. 包名迁移

**文件：** `alephant-mcp/package.json`

| 字段 | 变更前 | 变更后 |
|------|-------|-------|
| `name` | `@gengbingbing/alephant-mcp` | `@alephant/mcp` |
| `version` | `1.0.3` | `1.1.0` |
| `bin` | `{ "alephant-mcp": "dist/index.js" }` | 不变 |
| `description` | 空 | `FinOps & virtual key management MCP Server for AI developers` |

**前置行动（阻塞项）：**
- 在 npmjs.com 注册 `alephant` organization（确认包名未被占用）
- 在仓库 README 更新安装命令为 `npx @alephant/mcp`

**发布命令：**
```bash
npm publish --access public
```

---

### 2. smithery.yaml 设计

**文件：** `alephant-mcp/smithery.yaml`（根目录新建）

Smithery 用此文件展示 MCP Server 的参数配置表单。Alephant MCP 支持 PAT/VK 双模式，设计为全字段可选 + description 清晰说明适用模式：

```yaml
name: Alephant MCP
description: >
  FinOps & virtual key management for AI developers.
  Query spend, manage virtual keys, and enforce budget policies
  directly from your AI coding assistant.
license: MIT
homepage: https://alephant.io
repository: https://github.com/alephant-ai/alephant-mcp

startCommand:
  type: stdio
  command: npx
  args: ["-y", "@alephant/mcp"]

configSchema:
  type: object
  properties:
    ALEPHANT_VIRTUAL_KEY:
      type: string
      title: "Virtual Key (VK Mode)"
      description: >
        For developers: your virtual key (starts with vk-).
        Use this if you don't have dashboard access.
        Mutually exclusive with ALEPHANT_PAT.
      sensitive: true
    ALEPHANT_PAT:
      type: string
      title: "Personal Access Token (PAT Mode)"
      description: >
        For workspace admins: your personal access token (starts with pat_).
        Provides full workspace management access.
        Mutually exclusive with ALEPHANT_VIRTUAL_KEY.
      sensitive: true
    ALEPHANT_BASE_URL:
      type: string
      title: "API Base URL (optional)"
      description: >
        Override the default API endpoint.
        Leave blank for production.
      default: "https://api.alephant.io/v1"
  anyOf:
    - required: ["ALEPHANT_VIRTUAL_KEY"]
    - required: ["ALEPHANT_PAT"]
```

**设计说明：**
- `anyOf` 约束确保 PAT 和 VK 至少提供一个，但 Smithery UI 两个字段均展示，description 说明互斥关系
- `sensitive: true` 确保密钥值在 Smithery 界面中被遮掩
- `ALEPHANT_BASE_URL` 有默认值，用户留空即可使用生产环境

---

### 3. 目录注册

#### 3.1 Smithery 注册

- **方式：** 将仓库提交到 Smithery，使用根目录 `smithery.yaml`
- **条目展示：** Server 名称、描述、配置表单、安装命令自动从 `smithery.yaml` 读取
- **前置条件：** GitHub 仓库设为 public

#### 3.2 Glama 注册

- **方式：** 填写 Glama 提交表单，提供 GitHub 仓库 URL
- **无需额外配置文件**

#### 3.3 modelcontextprotocol/servers PR

在官方 [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) 仓库 README 的 server 表格插入一行：

```markdown
| [Alephant](https://github.com/alephant-ai/alephant-mcp) | FinOps & virtual key management | [@alephant/mcp](https://npmjs.com/package/@alephant/mcp) |
```

遵循该仓库贡献指南，PR 标题格式：`feat: add Alephant MCP server`

---

### 4. 阶段 1.1 — 发布即自动覆盖的平台

Track 1.0 完成后，以下平台**无需额外工作**即可接入（均支持 stdio MCP 协议）：

| 平台 | 用户配置入口 |
|------|------------|
| Cline | `.cline/mcp.json` |
| Cursor | Cursor Settings → MCP |
| Continue.dev | `~/.continue/config.json` |
| Roo Code | 同 Cline |
| LobeChat | Smithery 市场搜索 Alephant |
| Goose | MCP server 配置 |
| Claude Desktop | `claude_desktop_config.json` |

---

### 5. 用户配置参考（最终 JSON）

#### PAT 模式（管理员）

```json
{
  "mcpServers": {
    "alephant": {
      "command": "npx",
      "args": ["-y", "@alephant/mcp"],
      "env": {
        "ALEPHANT_PAT": "pat_wsa3f8c2_...",
        "ALEPHANT_BASE_URL": "https://api.alephant.io/v1"
      }
    }
  }
}
```

#### VK 模式（开发者）

```json
{
  "mcpServers": {
    "alephant": {
      "command": "npx",
      "args": ["-y", "@alephant/mcp"],
      "env": {
        "ALEPHANT_VIRTUAL_KEY": "vk-your-key-here"
      }
    }
  }
}
```

VK 模式不需要 `ALEPHANT_BASE_URL`（默认值生效，保持 snippet 简洁）。

---

## Track 1.2 — 接入文档 + 双入口 Copy MCP Config

### 1. 总体方案

**双入口设计（方案 B）：**
- **PAT 面板**（登录用户）：copy PAT 模式 config
- **VK 详情页**（admin 视角）：copy VK 模式 config，供 admin 发给不登录系统的外部开发者
- **共享组件** `McpConfigSnippet`：两处复用同一组件

**背景约束：** VK 持有者不登录 Alephant 系统，因此 VK 模式 copy config 的对象是 admin（admin 登录系统、管理 VK），而非最终使用 VK 的开发者。

---

### 2. 共享组件：McpConfigSnippet

**文件：** `Alephantinterface/src/app/components/common/McpConfigSnippet.tsx`

```typescript
interface McpConfigSnippetProps {
  mode: 'pat' | 'vk'
  value: string        // PAT 或 VK 的实际值（明文）
  docsUrl?: string     // 接入文档链接，默认指向官网文档页
}
```

**行为：**
- 根据 `mode` 生成对应 JSON（见上方用户配置参考）
- 深色 code block（`bg-gray-900` 风格），JSON 内容语法高亮 key/value
- 右上角「Copy」按钮，点击后变「Copied ✓」持续 2 秒，使用 `navigator.clipboard.writeText`
- code block 下方一行小字链接：`View integration guide →`，指向 `docsUrl`

---

### 3. PAT 面板入口（PAT 模式）

**触发位置 A：** PAT 创建成功弹窗（success dialog）

- 现有成功弹窗在创建 PAT 后展示 token 值
- 在 token 展示区下方新增 `McpConfigSnippet` 组件（`mode="pat"`，`value={pat.token}`）
- section 标题：「Use with MCP Clients」

**触发位置 B：** PAT 列表行

- hover 时在行尾出现次级操作按钮「Copy MCP Config」（与现有「Copy Token」并列）
- 点击后打开 inline tooltip 或 popover，内嵌 `McpConfigSnippet`

**生成 config：** 包含 `ALEPHANT_PAT`（明文）+ `ALEPHANT_BASE_URL`（`https://api.alephant.io/v1`）

---

### 4. VK 详情页入口（VK 模式，admin 视角）

**触发位置：** VK 详情弹窗/侧边栏的顶部操作区

- 在 VK 详情页顶部新增一个「Copy MCP Config」按钮（ghost 样式，次级，不抢「Edit」等主按钮）
- 点击后展开 inline 区块，内嵌 `McpConfigSnippet`（`mode="vk"`，`value={vk.key}`）

**生成 config：** 仅包含 `ALEPHANT_VIRTUAL_KEY`（不含 base URL，保持简洁）

**操作说明文案（在 snippet 上方）：**
> Share this config with the developer who will use this virtual key.

---

### 5. 接入文档结构（3 篇）

文档发布到官网/博客，URL 作为 `McpConfigSnippet` 的 `docsUrl` 默认值。

| 文档标题 | 覆盖平台 | 重点内容 |
|---------|---------|---------|
| Connect Alephant to Cursor | Cursor | Settings → MCP 截图 + 两种模式 config |
| Connect Alephant to Claude Desktop | Claude Desktop | macOS/Windows 配置文件路径 + 两种模式 config |
| Connect Alephant to Cline / Continue.dev / Roo | Cline, Continue.dev, Roo Code | 配置文件位置差异，统一 config 格式 |

每篇文档结构：
1. 背景：什么是 Alephant MCP
2. 前提：安装 Node.js 18+
3. 步骤：获取 PAT 或 VK → 复制 config → 粘贴到对应平台配置文件 → 重启 AI 工具
4. 验证：询问 AI 工具「list my virtual keys」查看是否生效
5. 附：两种模式对比表（PAT 模式适用 admin，VK 模式适用开发者）

---

## 工作量汇总

| 子任务 | 负责 | 估时 |
|--------|------|------|
| `package.json` 包名 + 版本迁移 | 后端 | 0.5 天 |
| npm 发布（含 npm org 注册） | 后端 | 0.5 天 |
| `smithery.yaml` 创建 + Smithery 注册 | 后端 | 0.5 天 |
| Glama 注册 | 后端 | 0.5 天 |
| modelcontextprotocol/servers PR | 后端 | 1 天 |
| `McpConfigSnippet` 共享组件 | 前端 | 0.5 天 |
| PAT 面板双入口接入 | 前端 | 0.5 天 |
| VK 详情页入口接入 | 前端 | 0.5 天 |
| 3 篇接入文档 | 产品/开发 | 1.5 天 |
| **合计** | | **6 天** |

---

## 非目标

- 不发布 Track 2（Python SDK）——属独立工作流，另立设计文档
- 不修改 MCP Server 功能代码——Track 1 纯发布与分发
- 不新增后端 API——复用现有 PAT/VK 数据读取逻辑

---

## 风险

| 风险 | 缓解措施 |
|------|---------|
| npm `@alephant` org 名称未注册或被占用 | 提前注册，若冲突备选 `@alephant-ai` |
| modelcontextprotocol/servers PR review 周期不确定 | PR 提交后不阻塞其他任务，发布即可用 |
| 双模式开发线未完成阻塞 Track 1.0 | 设内部 alpha 测试里程碑作为前置门槛 |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-04-01 | 初稿：Track 1.0（npm + smithery.yaml + 三目录）+ Track 1.2（双入口 copy config + 文档）完整设计；base URL 确认为 `https://api.alephant.io/v1`。 |
