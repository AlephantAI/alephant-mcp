# Alephant MCP Server — 产品需求文档（PRD）

**版本**: 1.0  
**日期**: 2026-03-10  
**范围**: alephant-mcp（@gengbingbing/alephant-mcp，MCP 服务）  
**参考**: 项目规范 `.cursor/rules/project.mdc`、Cockpit API 规范 `docs-dev/plans/2026-03-10-alephant-cockpit-api-spec.md`、MCP 源码分析 `docs-dev/plans/2026-03-10-alephant-mcp-analysis.md`

---

## 1. 产品概述

### 1.1 定位

**Alephant MCP Server** 是 Alephant BYO-KEY 平台在 IDE 内的 **AI 对话侧** 延伸：通过 **Model Context Protocol (MCP)** 暴露 FinOps 工具与审计 Prompt，让 Cursor 等 IDE 中的 AI 能够「查预算、列密钥、下策略、出报告」，与侧边栏 **Alephant Cockpit**（人看面板、人点按钮）互补。

- **一句话**: 企业级 AI FinOps 的 MCP 服务——让 AI 具备成本感知与策略执行能力。
- **与主产品关系**: 与 Cockpit 共用 **SaaS 聚合 API**（/api/cockpit/*）；数据与策略经 SaaS 拉取/下发，不直连 policy-service、ai-gateway 或数据库。

### 1.2 目标用户

| 用户类型 | 使用场景 | 价值 |
|----------|----------|------|
| 在 Cursor 内用 AI 的开发者 | 在对话中问「我们预算还剩多少」「把某 Agent 切到低成本」 | 无需切到 Cockpit 或浏览器，由 AI 直接调 MCP 工具 |
| 团队/部门负责人 | 让 AI「生成一份本周成本审计报告」 | 通过 cost_audit_report Prompt 自动链式调用 tool 并输出 Markdown |
| 运维/自动化 | 用 crontab 执行 `alephant-mcp --audit` 做定时审计占位 | 命令行模式可扩展为真实拉数并写文件 |

### 1.3 核心价值

- **对话内 FinOps**：在写代码、问 AI 的同一会话中完成预算查询与策略下发，无需离开 IDE。
- **与 Cockpit 能力一致**：同一批后端接口与鉴权，用户可选「看面板」或「问 AI」两种入口。
- **可编排的审计**：通过 Prompt 模板固定「先查预算 → 再列密钥 → 再诊断 → 出报告」的流程，降低使用门槛。

---

## 2. 功能需求

### 2.1 Tools（P0）

| 工具名 | 参数 | 行为 | 数据来源（目标状态） |
|--------|------|------|----------------------|
| **get_budget_status** | workspaceId, department? | 返回剩余预算、已耗、环比、最大消耗源、状态的文本摘要 | GET `/api/cockpit/dashboard` + GET `/api/cockpit/live-metrics`；未对接时可为 Mock |
| **list_virtual_keys** | workspaceId | 返回工作区内虚拟密钥/归因列表（id、agent、model、限额、用量等） | GET `/api/cockpit/workspaces` + dashboard.attributionItems 或后端虚拟密钥列表接口 |
| **apply_cost_policy** | keyId, policy | 对指定密钥或当前 scope 执行 block / low-cost / restore | POST `/api/cockpit/policy`，body `{ action }`；未对接时可为占位文案 |

- **统一错误**：所有 tool 在异常时返回 `content[].text` 含简短原因 + `isError: true`，便于 AI 给出明确失败说明。
- **Tool 描述**：每个 tool 的 schema 与 describe 需便于 AI 理解用途与参数，建议英文说明 + 示例。

### 2.2 Prompts（P0）

- **cost_audit_report**  
  - 参数：period（weekly/monthly/quarterly）、workspaceId（默认 Axpha-Main）。  
  - 行为：返回一条 user 消息，指导 AI 依次调用 get_budget_status、list_virtual_keys，结合数据诊断（如环比 >10% 警告），并输出 Markdown 报告（核心结论、消耗画像、风险与建议）。  
  - 价值：用户说「生成周报」即可触发，无需记忆 tool 调用顺序。

### 2.3 配置与鉴权（P0）

- **配置**  
  - **API Base URL**：环境变量 `ALEPHANT_API_BASE_URL`（或等价），与 Cockpit 的 `alephant.apiBaseUrl` 对齐；未配置且非 Mock 时 tool 返回明确提示。  
  - **凭证**：支持 **User Token** 或 **Virtual Key**；环境变量 `ALEPHANT_TOKEN` 或 `ALEPHANT_VIRTUAL_KEY`（或由 Cursor MCP 的 env 注入）。请求后端时带 `Authorization: Bearer <token>` 或 `X-Alephant-Virtual-Key: <key>`。  
  - **Mock 开关**：未配置 Base URL 或 `ALEPHANT_USE_MOCK=true` 时使用内存 Mock，便于本地与演示。

- **鉴权与 Cockpit 一致**：双模式、同一套后端接口；用户可同一密钥既调网关又调 MCP/Cockpit。

### 2.4 命令行模式（P1）

- **--audit**  
  - 执行 `npx @gengbingbing/alephant-mcp --audit` 时不启动 MCP，而是执行「审计」逻辑：可调用 get_budget_status + list_virtual_keys（真实或 Mock），将结果输出到 stdout 或指定文件，便于 crontab 定时审计。  
  - 当前可为占位输出；对接真实 API 后输出真实摘要或 Markdown。

### 2.5 扩展性与可维护性（P1）

- **Client 抽象**：所有请求后端的能力经统一 Client（如 getDashboard、getLiveMetrics、applyPolicy），tool 仅做参数校验与结果转 MCP content；便于 Mock/真实切换与与 Cockpit 共享逻辑。  
- **结构**：当前单文件可保留；tool 增多时可拆为 `src/tools/`、`src/prompts/`、`src/client/`，并可选暴露 **Resources**（如 `alephant://workspace/{id}/policy-state`）供 AI 只读。  
- **文档与版本**：README 写清安装、Cursor 配置、环境变量；CHANGELOG 随版本记录变更；tool 与 Prompt 的 describe 便于 AI 与人类理解。

### 2.6 数据与策略边界（必须遵守）

- **数据来源**：仅通过 **SaaS 聚合 API**（/api/cockpit/*）或 gateway-data-warehouse 只读查询获取；不直接连接 ClickHouse/PostgreSQL。  
- **策略执行**：经 **SaaS 后端 API**（POST /api/cockpit/policy）下发，由 SaaS 写库并推送 policy-service；MCP **不直接调用 policy-service 或网关**。

---

## 3. 非功能需求

- **运行时**：Node.js 18+；通过 `npx -y @gengbingbing/alephant-mcp` 即跑，无需全局安装。  
- **传输**：MCP 使用 StdioServerTransport，与 Cursor 通过 stdin/stdout 通信。  
- **依赖**：@modelcontextprotocol/sdk、zod、axios（对接真实 API 时使用）；构建为 tsc 直出，发布仅含 dist。  
- **易用性**：安装与 Cursor 配置步骤简单；未配置凭证时错误信息明确；所有 tool 错误返回格式统一。

---

## 4. 数据层与 API 依赖

- **接口契约**：与 Cockpit 一致，见 `docs-dev/plans/2026-03-10-alephant-cockpit-api-spec.md` 与 backend-saas PRD §5.13。  
- **MCP 与 API 映射**：  
  - get_budget_status → GET dashboard + live-metrics  
  - list_virtual_keys → GET workspaces + 归因/虚拟密钥数据（dashboard.attributionItems 或后端专项接口）  
  - apply_cost_policy → POST /api/cockpit/policy  
- **鉴权**：User Token（Bearer）或 Virtual Key（Bearer / X-Alephant-Virtual-Key）；与 Cockpit 双模式一致。

---

## 5. 范围外（Out of Scope）

- 不替代 SaaS Web 管理端或 Cockpit 的完整配置与可视化。  
- 不直接连接 policy-service、ai-gateway、ClickHouse/PostgreSQL。  
- 不实现 MCP 之外的传输（如 HTTP 暴露 MCP）；当前仅 stdio。  
- 插件内 OAuth/登录由 Cockpit 负责；MCP 仅通过环境变量或 Cursor 注入的凭证调用后端。

---

## 6. 附录与参考

- **MCP 源码与扩展性/易用性分析**：`docs-dev/plans/2026-03-10-alephant-mcp-analysis.md`  
- **Cockpit API 规范**：`docs-dev/plans/2026-03-10-alephant-cockpit-api-spec.md`  
- **后端 Cockpit 接口（§5.13）**：`docs-dev/backend-saas-prd-for-interface-737.md`  
- **项目全局规范**：`.cursor/rules/project.mdc`
