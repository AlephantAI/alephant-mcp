# Track 1.0 MCP npm 发布与目录注册 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `@gengbingbing/alephant-mcp` 更名并发布为 `@alephant/mcp`，创建 `smithery.yaml`，完成三大 MCP 目录注册，使任意开发者可通过 `npx @alephant/mcp` 一键接入。

**Architecture:** 纯配置/发布类工作，不涉及功能代码变更。`package.json` 更名 + 版本升级；新建 `smithery.yaml` 声明双模式参数 schema；分别向 Smithery、Glama、modelcontextprotocol/servers 提交注册。

**Tech Stack:** Node.js / npm, YAML, GitHub PR

**Spec:** `alephant-mcp/docs/2026-04-01-track1-mcp-distribution-design.md`

**前置条件（阻塞项）：** 双模式架构（PAT + VK）完整实现并通过集成测试；双模式代码在 main 分支。若前置条件未满足，Task 1–5 中的代码部分仍可先行完成，但 `npm publish` 步骤须等前置条件就绪。

---

## 文件清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| Modify | `alephant-mcp/package.json` | 包名、版本、description 字段 |
| Create | `alephant-mcp/smithery.yaml` | Smithery marketplace 配置文件 |
| Modify | `alephant-mcp/README.md` | 安装命令更新为 `@alephant/mcp` |
| Manual | npm publish | 需要 npm 登录 `alephant` org |
| PR | modelcontextprotocol/servers | 外部仓库 PR |
| Form | Smithery, Glama | 在线注册表单 |

---

## Task 1：package.json 更新

**Files:**
- Modify: `alephant-mcp/package.json`

- [ ] **Step 1: 读取当前 package.json 确认字段**

  打开 `alephant-mcp/package.json`，确认当前内容：
  ```json
  {
    "name": "@gengbingbing/alephant-mcp",
    "version": "1.0.3",
    ...
  }
  ```

- [ ] **Step 2: 更新 name、version、description**

  修改以下字段：
  ```json
  {
    "name": "@alephant/mcp",
    "version": "1.1.0",
    "description": "FinOps & virtual key management MCP Server for AI developers",
    ...
  }
  ```
  
  `bin`、`main`、`scripts`、`dependencies` 等字段不变。

- [ ] **Step 3: 验证 package.json 合法性**

  ```bash
  cd alephant-mcp
  node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('OK')"
  ```
  
  预期输出：`OK`

- [ ] **Step 4: Commit**

  ```bash
  git add package.json
  git commit -m "chore: rename package to @alephant/mcp, bump version to 1.1.0"
  ```

---

## Task 2：smithery.yaml 创建

**Files:**
- Create: `alephant-mcp/smithery.yaml`

- [ ] **Step 1: 在仓库根目录创建 smithery.yaml**

  文件内容（注意 `ALEPHANT_BASE_URL` 默认值为生产 URL）：

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

- [ ] **Step 2: 验证 YAML 语法**

  ```bash
  node -e "require('js-yaml').load(require('fs').readFileSync('smithery.yaml','utf8')); console.log('YAML OK')"
  ```
  
  若未安装 js-yaml，可用 Python：
  ```bash
  python -c "import yaml; yaml.safe_load(open('smithery.yaml')); print('YAML OK')"
  ```
  
  预期输出：`YAML OK`

- [ ] **Step 3: Commit**

  ```bash
  git add smithery.yaml
  git commit -m "feat: add smithery.yaml for Smithery marketplace registration"
  ```

---

## Task 3：README 更新

**Files:**
- Modify: `alephant-mcp/README.md`

- [ ] **Step 1: 全局替换旧包名**

  在 README.md 中，将所有 `@gengbingbing/alephant-mcp` 替换为 `@alephant/mcp`。

  使用编辑器搜索替换，或：
  ```bash
  # 预览变更
  cat README.md | grep -n "gengbingbing"
  ```

- [ ] **Step 2: 确认 npm install / npx 示例命令已更新**

  确保文档中安装示例类似：
  ```bash
  npx @alephant/mcp
  # 或
  npm install -g @alephant/mcp
  ```

- [ ] **Step 3: 更新 npm badge（如有）**

  若 README 顶部有 npm 版本 badge，将 URL 中的包名更新为 `@alephant%2Fmcp`。

- [ ] **Step 4: Commit**

  ```bash
  git add README.md
  git commit -m "docs: update README install commands to @alephant/mcp"
  ```

---

## Task 4：构建与本地验证

**Files:**
- 无新增文件

- [ ] **Step 1: 安装依赖，执行构建**

  ```bash
  cd alephant-mcp
  npm install
  npm run build
  ```
  
  预期：`dist/` 目录下生成编译文件，无 TypeScript 错误。

- [ ] **Step 2: 本地以 npx 方式验证 bin 入口**

  ```bash
  # 验证 bin 入口可执行（不会真正启动，仅确认 node 可解析入口文件）
  node dist/index.js --help 2>&1 | head -5
  ```
  
  预期：MCP server 入口无 import 错误（可能输出版本信息或等待 stdio）。

- [ ] **Step 3: 确认 package.json 中 files 字段或 .npmignore 配置正确**

  确保 `dist/` 目录包含在发布内容中，`src/`（TypeScript 源码）、`node_modules/`、`.env` 等不包含。
  
  检查方式：
  ```bash
  npm pack --dry-run 2>&1 | head -30
  ```
  
  预期：输出中应含 `dist/index.js` 等编译产物，不含 `src/` TypeScript 文件。

---

## Task 5：npm 发布

> ⚠️ **阻塞条件：** 执行此任务前须确认 `@alephant` npm organization 已注册，且双模式实现已在 main 分支完成。

**Files:**
- 无新增文件

- [ ] **Step 1: 登录 npm（使用 alephant org 账号）**

  ```bash
  npm login
  # 按提示输入用户名、密码、2FA
  ```
  
  确认登录身份：
  ```bash
  npm whoami
  # 预期输出：alephant（或有权限的账号）
  ```

- [ ] **Step 2: 检查包名是否已存在**

  ```bash
  npm view @alephant/mcp version 2>&1
  ```
  
  若输出 `npm ERR! 404` 则包名未被占用，可继续。若已存在，确认版本号高于已发布版本。

- [ ] **Step 3: 发布**

  ```bash
  npm publish --access public
  ```
  
  预期输出：
  ```
  npm notice Publishing to https://registry.npmjs.org/
  + @alephant/mcp@1.1.0
  ```

- [ ] **Step 4: 验证发布成功**

  等待约 30 秒后：
  ```bash
  npm view @alephant/mcp
  # 预期：显示版本 1.1.0、dist tags latest、downloadCount 等
  ```
  
  或直接在浏览器访问：`https://www.npmjs.com/package/@alephant/mcp`

- [ ] **Step 5: 用 npx 端到端验证（可选）**

  在全新目录中：
  ```bash
  npx -y @alephant/mcp
  # MCP server 启动，等待 stdin 输入（Ctrl+C 终止）
  ```

---

## Task 6：Smithery 目录注册

> 前置条件：Task 5 完成（npm 已发布），GitHub 仓库为 public。

- [ ] **Step 1: 访问 Smithery 提交页面**

  打开 `https://smithery.ai/submit`（或 Smithery 官方注册入口）。

- [ ] **Step 2: 填写 GitHub 仓库 URL**

  ```
  https://github.com/alephant-ai/alephant-mcp
  ```
  
  Smithery 会自动读取仓库根目录的 `smithery.yaml`。

- [ ] **Step 3: 确认配置表单预览**

  确认 Smithery 展示的参数表单含 `ALEPHANT_VIRTUAL_KEY`、`ALEPHANT_PAT`、`ALEPHANT_BASE_URL` 三个字段，且 VK 和 PAT 至少填一个的约束有效。

- [ ] **Step 4: 提交，等待审核**

  记录提交 ID 或跟踪链接备查。

---

## Task 7：Glama 目录注册

> 前置条件：Task 5 完成。

- [ ] **Step 1: 访问 Glama MCP 提交页面**

  打开 `https://glama.ai/mcp/servers/submit`（或 Glama 官方入口）。

- [ ] **Step 2: 填写仓库信息**

  - Repository URL: `https://github.com/alephant-ai/alephant-mcp`
  - npm package: `@alephant/mcp`
  - 描述：同 `smithery.yaml` description

- [ ] **Step 3: 提交，等待审核**

---

## Task 8：modelcontextprotocol/servers PR

> 前置条件：Task 5 完成。

- [ ] **Step 1: Fork modelcontextprotocol/servers 仓库**

  ```
  https://github.com/modelcontextprotocol/servers
  ```

- [ ] **Step 2: 在 README.md 的 server 列表中插入 Alephant 条目**

  找到表格中按字母 A 排序的位置，插入：
  ```markdown
  | [Alephant](https://github.com/alephant-ai/alephant-mcp) | FinOps & virtual key management | [@alephant/mcp](https://npmjs.com/package/@alephant/mcp) |
  ```

- [ ] **Step 3: 创建 PR**

  - PR 标题：`feat: add Alephant MCP server`
  - PR 描述：
    ```
    Adds Alephant MCP server - FinOps & virtual key management for AI developers.
    - npm: @alephant/mcp
    - Supports PAT mode (workspace admins) and VK mode (developers)
    - Works with Cursor, Claude Desktop, Cline, Continue.dev, Roo Code
    ```

- [ ] **Step 4: 跟进 PR review，按反馈修改**

---

## 完成检查

完成以上所有 Task 后，执行以下验证：

```bash
# 1. npm 包可查
npm view @alephant/mcp version
# 预期: 1.1.0

# 2. npx 可启动
npx -y @alephant/mcp --version
# 预期: 无 404/not found 错误

# 3. smithery.yaml 存在
cat alephant-mcp/smithery.yaml | grep "name:"
# 预期: name: Alephant MCP
```

浏览器验证：
- `https://www.npmjs.com/package/@alephant/mcp` — 包页面正常
- Smithery 搜索 "alephant" — 条目出现
- Glama 搜索 "alephant" — 条目出现（注册后 1-3 天）
