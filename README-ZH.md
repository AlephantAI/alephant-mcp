# 🐘 Alephant MCP Server — AI 财务运营治理

**Alephant MCP Server** 是一款以开发者为中心的基础设施工具，旨在将 AI 成本管理直接集成到您的 AI IDE（如 Cursor、Claude Desktop、VS Code Copilot）中。通过实现 **Model Context Protocol (MCP)**，它将您的 AI 助手从简单的"代码生成器"转变为具备"财务意识的架构师"。

## 核心能力

- **预算护栏**：实时追踪 Token 消耗情况和剩余余额
- **身份归因**：将每一笔 AI 请求精准映射到特定智能体或部门
- **主动干预**：根据成本策略，通过程序化实现模型降级或请求拦截
- **自动化审计**：内置提示词模板，一键生成专业的周报、月报和季报

## 快速入门

### 1. 安装方式

本项目通过 NPM 分发，支持使用 npx 无缝集成。

```bash
npm install -g @alephantai/mcp
```

### 2. Cursor 集成步骤

要在 Cursor 中开启"全栈治理驾驶舱"：

1. 打开 **Cursor 设置** → **功能 (Features)** → **MCP**
2. 点击 **+ Add New MCP Server**
3. 填写以下信息：
   - **名称 (Name)**: Alephant
   - **类型 (Type)**: command
   - **命令 (Command)**: `npx -y @alephantai/mcp`
4. 配置环境变量以对接真实后端：
   - **ALEPHANT_API_BASE_URL**：后端地址，如 `https://api.alephant.ai`
   - **ALEPHANT_VIRTUAL_KEY**：您的虚拟 Key（VK 模式，只读）
   - 或 **ALEPHANT_PAT** + **ALEPHANT_WORKSPACE_ID**（Manager 模式，完整管理权限）
5. 确认状态指示灯变为 **绿色**

### 3. 两种运行模式

| 模式 | 环境变量 | 权限 | 工具数量 |
|------|----------|------|----------|
| **VK** | `ALEPHANT_VIRTUAL_KEY` | 只读，单个 cockpit 范围 | 7 个 |
| **Manager** | `ALEPHANT_PAT` + `ALEPHANT_WORKSPACE_ID` | 工作区完整管理 | 15 个 |

PAT 优先。如果两者都未设置，进程将退出（不使用 Mock 数据）。

## 使用场景

| 用户意图 | 建议指令 |
| :---- | :---- |
| **检查健康度** | "查一下当前预算状态。" |
| **查看归因** | "列出当前 scope 的消耗归因。" |
| **生成报告** | "生成一份每周成本审计报告。" |
| **管理密钥** | "列出所有虚拟密钥。" / "创建一个新的虚拟密钥。" |
| **查看分析** | "列出所有 Agent。" / "查看部门分析。" |

## 定时任务与主动汇报

Alephant 支持 CLI 审计功能。

- **AI 调度**：直接对 AI 说：*"帮我安排一个计划任务：每周一早 9 点执行一次 Alephant 审计。"*
- **本地 Cron**：在您的 crontab 中添加：`0 9 * * 1 npx --yes --package=@alephantai/mcp alephant-mcp --audit >> ./AUDIT.md`

## 开发

```bash
npm install
npm test
npm run build
```

## 文档

- **[英文 README](README.md)** — 完整的工具列表、配置示例和故障排除
- **docs/zh-IN/agent-mcp-usage.md** — 自然语言提问示例、工具对照表

**由 Alephant 核心团队开发 | 基于 2026 AI 治理标准**
