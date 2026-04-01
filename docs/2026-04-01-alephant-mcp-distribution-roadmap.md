# Alephant MCP 生态分发路线图

**日期：** 2026-04-01  
**状态：** 规划中（纯策略文档，不含实现代码）  
**受众：** Alephant 内部团队  
**负责人：** 待分配  

---

## 背景

`alephant-mcp` 是一个 TypeScript 实现的 MCP Server，为 AI 工具提供 FinOps 数据查询与虚拟密钥管理能力。目前仓库处于开发阶段，尚未对外发布。

本文档规划从**"仓库内测"到"生态可见"**的分发路径，以最小工程投入最大化覆盖目标用户（AI 开发者 + 企业用量管理者）。

**参考文档：**
- 架构设计：`docs/2026-03-31-alephant-mcp-dual-mode-design.md`
- 平台评估：`docs/Plugin Targets (Ranked).md`

---

## 战略选择

### 方案对比

| 方案 | 描述 | 工作量 | 覆盖范围 |
|------|------|--------|---------|
| A — 单轨 MCP 分发 | 仅发布 @alephant/mcp，注册各 MCP 目录 | 3-5 人天 | MCP 原生平台（5 个，~5M 用户） |
| **B — 双轨并行（选定）** | MCP 分发 + LangChain/LlamaIndex Python SDK | 8-14 人天 | MCP 原生平台 + Python 生态（~2 亿月活） |
| C — 全平台覆盖 | A + B + n8n + Dify + Open WebUI 等 | 40-60 人天 | 全部 25 个平台 |

**选定方案 B**，理由：
- MCP 发布是基础动作，0 边际成本自动覆盖 5 个高星平台
- LangChain（97K+ Stars）+ LlamaIndex（40K+ Stars）是 Python AI 开发者最大入口
- Python SDK 单次建设后维护成本低，与 MCP Server 解耦
- 方案 C 中的 n8n / Dify 等可在方案 B 完成后视用户需求决策

---

## 双轨并行架构

```
┌─────────────────────────────────────────────────────────┐
│                  Alephant 生态分发                       │
├──────────────────────────┬──────────────────────────────┤
│    Track 1: MCP 分发     │    Track 2: Python SDK        │
│                          │                               │
│  @alephant/mcp (npm)     │  alephant-langchain (PyPI)   │
│         ↓                │  alephant-llamaindex (PyPI)   │
│  Smithery / Glama /      │         ↓                     │
│  modelcontextprotocol.io │  LangChain 官方集成目录        │
│         ↓                │  LlamaIndex Hub               │
│  Cline / Cursor /        │         ↓                     │
│  Continue.dev / Roo /    │  Python AI 开发者生态          │
│  LobeChat / Goose 等     │  (~200M+ 月活)                │
└──────────────────────────┴──────────────────────────────┘
```

---

## Track 1：MCP 生态分发

### 阶段 1.0 — npm 发布与目录注册（前置，约 3 人天）

**前提条件（阻塞项）：** `alephant-mcp` 双模式架构（`docs/2026-03-31-alephant-mcp-dual-mode-design.md`）的三条开发线须全部完成：

```
依赖链：
  开发线 A（PAT 系统）+ 开发线 B（Cockpit API）+ 开发线 C（MCP Server 18 工具）
    → 集成测试通过
    → Track 1.0（npm 发布 + 目录注册）
    → Track 1.2（接入文档）/ Track 2（Python SDK）
```

> **注意：** 下方「Week 1/2/3/4」为**相对时间**，从双模式开发完成之日起算，非绝对日期。

| 任务 | 负责人 | 说明 | 估时 |
|------|--------|------|------|
| 包名迁移 | 后端 | `@gengbingbing/alephant-mcp` → `@alephant/mcp`，更新 `package.json` | 0.5 天 |
| npm 正式发布 | 后端 | `npm publish --access public`，发布到 npmjs.com | 0.5 天 |
| Smithery 注册 | 后端 | 按 `smithery.yaml` 格式提交仓库到 Smithery（设计文档 §5.9 已定义格式） | 0.5 天 |
| Glama 注册 | 后端 | 向 Glama 提交 GitHub 仓库 URL | 0.5 天 |
| modelcontextprotocol/servers PR | 后端 | 在官方 README 的 server 列表添加 Alephant 条目 | 1 天 |

**交付物：**
- `@alephant/mcp` 在 npmjs.com 可搜索并安装
- 三个 MCP 目录均可发现 Alephant MCP Server
- 仓库 README 包含标准安装说明

---

### 阶段 1.1 — 0 天自动覆盖的平台（发布即生效）

以下平台原生支持 MCP 协议，`@alephant/mcp` 发布后用户**无需等待**即可接入：

| 平台 | Stars | MCP 支持方式 | 预估用户量 | 用户操作 |
|------|-------|------------|-----------|---------|
| **Cline** | 59K | MCP 协议原生，Smithery 市场 | 5M+ VS Code 安装 | 在 `.cline/mcp.json` 添加配置 |
| **Cursor** | — | MCP 协议原生 | 数百万开发者 | 在 Cursor MCP 设置中添加 server |
| **Continue.dev** | 22K | MCP 协议原生 | 大型开源社区 | 在 `config.json` 添加 alephant server |
| **Roo Code** | 25K | MCP 协议原生 | VS Code 用户 | 同 Cline |
| **LobeChat** | 55K | Smithery MCP 市场 | 大型自部署社区 | 在插件市场搜索 Alephant |
| **Goose** | 26K | MCP 协议原生 | Linux Foundation 社区 | 配置 MCP server |
| **Claude Desktop** | — | MCP 协议原生（官方） | Anthropic 用户 | 在 `claude_desktop_config.json` 添加 |

**总结：** 仅需 Track 1.0 完成，即可覆盖以上所有平台，**无额外开发工作**。

---

### 阶段 1.2 — 接入文档与用户指南（约 2 人天）

| 任务 | 负责人 | 说明 | 估时 |
|------|--------|------|------|
| Cursor 接入指南 | 产品/开发 | 截图 + `mcp_config` 代码片段，发博客/X/官网文档 | 0.5 天 |
| Claude Desktop 接入指南 | 产品/开发 | 同上，覆盖 VK 模式和 PAT 模式两种配置示例 | 0.5 天 |
| Cline / Continue.dev / Roo 接入指南 | 产品/开发 | 合并为一篇，重点说明配置文件位置 | 0.5 天 |
| PAT 面板"一键复制 MCP 配置"联动 | 前端 | 在 PAT 创建成功弹窗中生成完整 `mcp_config` JSON 代码片段（已在设计文档 §3.5 规划，此处仅对齐排期） | 0.5 天 |

**目标用户配置体验（VK 模式示例）：**

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

---

## Track 2：Python SDK（并行开发）

### 背景与选型

MCP Server 本身是 TypeScript，但 Python AI 框架（LangChain、LlamaIndex）拥有独立的 Python 生态、独立的包注册表（PyPI）和独立的集成目录。若仅发布 MCP Server，Python 开发者需要在其 Python 代码外额外维护一个 Node.js 进程，体验较差。

Python SDK 的职责：**让 Python 开发者一行代码将 LLM 调用路由到 Alephant AI Gateway**，通过 Virtual Key（VK）实现策略执行 + 费用自动归因，无需手动配置 `base_url` 和认证头。

**工作原理（非旁路监控，而是 Gateway 路由）：**

```
SDK 配置 LLM 客户端
  → base_url = Alephant Gateway
  → api_key = VK
  → LLM 调用自动经过 Gateway
  → Gateway 执行策略（限流/白名单/预算）
  → Gateway 转发请求到 LLM Provider
  → Gateway 记录日志 → MQ → ClickHouse
  → 费用数据自动归因到 VK 绑定的 Agent/Member
```

**SDK 不做数据上报**——所有用量数据通过 Gateway 现有管道自动采集。SDK 可选地通过 Cockpit API（GET 只读）查询预算余量，在 callback 中输出警告。

**技术选型原则：**
- SDK 核心功能是**配置 LLM 客户端走 Gateway 路由**（设置 `base_url` + VK 认证），不做数据上报
- 可选功能：通过 Cockpit API（`/api/v1/cockpit/*`，GET 只读）查询实时预算/费用
- 每个 SDK 独立 PyPI 包，按需安装，不捆绑
- **不需要后端新增端点**——复用 Gateway + 现有 Cockpit API

---

### 阶段 2.1 — LangChain Gateway Integration（约 3 人天）

**包名：** `alephant-langchain`  
**PyPI：** `pip install alephant-langchain`  
**目标用户：** LangChain 开发者，希望一行代码接入 Alephant FinOps（策略执行 + 费用追踪）

**目标用法：**

```python
from alephant_langchain import ChatAlephant

# 核心：LLM 调用自动路由到 Alephant Gateway
llm = ChatAlephant(
    virtual_key="vk-your-key-here",
    model="gpt-4o",
    # Optional: override gateway URL
    # gateway_url="https://gateway.alephant.ai"
)

# 请求经过 Gateway → 策略执行 → 转发到 OpenAI → 用量自动记录
response = llm.invoke("Explain FinOps in one sentence.")

# 可选：附加 budget callback，在预算超阈值时输出警告
from alephant_langchain import AlephantBudgetCallback

llm_with_budget = ChatAlephant(
    virtual_key="vk-your-key-here",
    model="gpt-4o",
    callbacks=[AlephantBudgetCallback(warn_threshold=0.8)]
)
```

**技术实现：**

| 组件 | 实现方式 |
|------|---------|
| `ChatAlephant` | 继承 `langchain_openai.ChatOpenAI`，自动设置 `base_url` 为 Alephant Gateway、`api_key` 为 VK |
| Gateway 路由 | VK 请求经过 Gateway → 策略执行（限流/白名单/预算）→ 转发到 LLM Provider → 日志自动采集 |
| `AlephantBudgetCallback`（可选） | 继承 `BaseCallbackHandler`，在 `on_llm_start` 时查询 `GET /api/v1/cockpit/budget-status`，预算超阈值时 `logging.warning` |
| 鉴权 | VK 直接作为 API Key 传递给 Gateway（`Authorization: Bearer vk-xxx`） |
| 数据采集 | **无需 SDK 上报**——Gateway 自动记录日志到 MQ → ClickHouse |

**与直接使用 ChatOpenAI 的对比：**

```python
# 不用 SDK — 需手动配置 3 个参数：
llm = ChatOpenAI(
    model="gpt-4o",
    api_key="vk-your-key-here",
    base_url="https://gateway.alephant.ai/v1"
)

# 用 SDK — 1 个参数，自动配置：
llm = ChatAlephant(virtual_key="vk-your-key-here", model="gpt-4o")
```

SDK 的价值：封装配置细节 + 可选 budget 回调 + LangChain 官方集成目录可发现性。

**向 LangChain 官方集成目录提交：**
- 在 [langchain-ai/langchain](https://github.com/langchain-ai/langchain) 仓库 `docs/docs/integrations/` 下添加 Alephant 条目
- 遵循 LangChain 官方 integration contribution 指南

**工作量估算：**

| 任务 | 估时 |
|------|------|
| 核心 `ChatAlephant` + `AlephantBudgetCallback` 实现 | 1 天 |
| 单元测试（mock Gateway + Cockpit API） | 0.5 天 |
| PyPI 包配置（`pyproject.toml`、`setup.py`） | 0.5 天 |
| README + 接入示例文档 | 0.5 天 |
| 向 LangChain 官方提 PR | 0.5 天 |
| **合计** | **3 天** |

---

### 阶段 2.2 — LlamaIndex Gateway Integration（约 3 人天）

**包名：** `alephant-llamaindex`  
**PyPI：** `pip install alephant-llamaindex`  
**目标用户：** LlamaIndex / RAG 开发者

**目标用法：**

```python
from llama_index.core import Settings
from alephant_llamaindex import AlephantOpenAI

# 使用 Alephant Gateway 路由的 LLM
llm = AlephantOpenAI(
    virtual_key="vk-your-key-here",
    model="gpt-4o"
)
Settings.llm = llm

# 所有 LlamaIndex 的 LLM 调用自动经过 Alephant Gateway
from llama_index.core import VectorStoreIndex
index = VectorStoreIndex.from_documents(documents)
response = index.as_query_engine().query("What is FinOps?")
```

**技术实现：**

| 组件 | 实现方式 |
|------|---------|
| `AlephantOpenAI` | 继承 `llama_index.llms.openai.OpenAI`，自动设置 `api_base` 为 Gateway、`api_key` 为 VK |
| Gateway 路由 | 与 LangChain SDK 一致——VK 经 Gateway → 策略 → 转发 → 自动记录 |
| 可选 budget callback | 提供 `AlephantBudgetHandler`（实现 `BaseCallbackHandler`），可注入 `Settings.callback_manager` |
| 数据采集 | **无需 SDK 上报**——Gateway 自动采集 |
| LlamaIndex Hub 注册 | 向 LlamaIndex Hub 提交集成 |

**工作量估算：**

| 任务 | 估时 |
|------|------|
| 核心 `AlephantOpenAI` + `AlephantBudgetHandler` 实现 | 1 天 |
| 单元测试 | 0.5 天 |
| PyPI 包配置 | 0.5 天 |
| README + 接入示例文档 | 0.5 天 |
| 向 LlamaIndex Hub 提交 | 0.5 天 |
| **合计** | **3 天** |

---

### Python SDK 共用基础设施（约 1 人天）

两个 SDK 共享的组件，可提取为 `alephant-python-core` 内部包或直接内嵌：

| 组件 | 说明 |
|------|------|
| `AlephantConfig` | Gateway URL 解析、VK 格式校验、环境变量读取（`ALEPHANT_VIRTUAL_KEY`、`ALEPHANT_GATEWAY_URL`） |
| `CockpitClient`（可选） | HTTP 客户端，封装 Cockpit API 只读查询（`GET /cockpit/budget-status` 等），供 budget callback 使用 |
| `ProviderRouter` | 根据 VK 前缀或 model 名称，确定 Gateway 端点路径（OpenAI / Anthropic / Google 各有不同的兼容路径） |

---

## 平台覆盖全景

### 阶段覆盖对照表

| 平台 | 类型 | Score | 接入方式 | 本路线图阶段 |
|------|------|-------|---------|------------|
| Cline | MCP 原生 | 27.0 | MCP Server（0 天） | Track 1.0 ✅ |
| Continue.dev | MCP 原生 | 21.0 | MCP Server（0 天） | Track 1.0 ✅ |
| Roo Code | MCP 原生 | 21.0 | MCP Server（0 天） | Track 1.0 ✅ |
| LangChain | Python 框架 | 20.0 | Python Callback Handler | Track 2.1 |
| LlamaIndex | Python 框架 | 18.0 | Python Callback / Integration | Track 2.2 |
| Goose | MCP 原生 | 15.0 | MCP Server（0 天） | Track 1.0 ✅ |
| LobeChat | MCP 市场 | 12.0 | Smithery → LobeChat | Track 1.0 ✅ |
| Cursor | MCP 原生 | — | MCP Server（0 天） | Track 1.0 ✅ |
| Claude Desktop | MCP 原生 | — | MCP Server（0 天） | Track 1.0 ✅ |
| CrewAI | Python 框架 | 12.0 | Python Integration | 需求驱动（方案 C） |
| n8n | 自动化平台 | 7.2 | Custom Node (TypeScript) | 需求驱动（方案 C） |
| Dify.ai | LLM 平台 | 9.6 | Plugin | 需求驱动（方案 C） |
| Open WebUI | 自托管 Chat | 10.5 | Tool/Function Plugin | 需求驱动（方案 C） |
| 其余 12 个 | 各类 | <10 | 各异 | 需求驱动（方案 C） |

---

## 里程碑与排期

### 总览

```
Week 1 ─────────────────────────────── Track 1.0
  ├─ @alephant/mcp npm 发布
  ├─ Smithery / Glama / modelcontextprotocol.io 注册
  └─ Cline / Cursor / Continue / Roo / LobeChat / Goose 自动可用

Week 2 ─────────────────────────────── Track 1.2 + Track 2 并行启动
  ├─ 各平台接入文档发布（Track 1.2）
  └─ LangChain Callback Handler 开发启动（Track 2.1）

Week 3 ─────────────────────────────── Track 2.1 收尾 + Track 2.2 启动
  ├─ alephant-langchain PyPI 发布
  ├─ 向 LangChain 官方提 PR
  └─ LlamaIndex Integration 开发启动（Track 2.2）

Week 4 ─────────────────────────────── Track 2 收尾
  ├─ alephant-llamaindex PyPI 发布
  ├─ 向 LlamaIndex Hub 提交
  └─ 全部 Track 1 + Track 2 完成，进入运营阶段
```

---

### 详细里程碑

| 里程碑 | 完成标志 | 目标日期 |
|--------|---------|---------|
| **M1：npm 发布** | `npm install @alephant/mcp` 可正常使用 | Week 1 |
| **M2：目录注册完成** | Smithery / Glama / modelcontextprotocol.io 均可搜索到 Alephant | Week 1 |
| **M3：MCP 平台文档上线** | 官网/博客发布 Cursor + Claude + Cline 接入指南 | Week 2 |
| **M4：LangChain SDK 发布** | `pip install alephant-langchain` 可用，示例文档完整 | Week 3 |
| **M5：LangChain 官方 PR 合并** | LangChain 官方 integrations 目录包含 Alephant 条目 | Week 3-4（取决于 LangChain review 周期） |
| **M6：LlamaIndex SDK 发布** | `pip install alephant-llamaindex` 可用 | Week 4 |
| **M7：全路线图完成** | 所有 Track 1 + Track 2 里程碑已达成 | Week 4 |

---

## 工作量汇总

| 阶段 | 工作内容 | 估时 | 负责角色 |
|------|---------|------|---------|
| Track 1.0 | npm 发布 + 3 个目录注册 | **3 天** | 后端工程师 |
| Track 1.2 | 接入文档 + PAT 面板联动 | **2 天** | 产品 / 前端 |
| Track 2 基础设施 | Python 共用 config + provider router + 可选 cockpit client | **1 天** | Python 工程师 |
| Track 2.1 | LangChain Gateway Integration + PyPI | **3 天** | Python 工程师 |
| Track 2.2 | LlamaIndex Gateway Integration + PyPI | **3 天** | Python 工程师 |
| **合计** | | **12 天** | |

> **说明：** Track 1 与 Track 2 可并行推进（Track 1.0 完成后即可启动 Track 1.2 和 Track 2），实际日历时间约 **3-4 周**。

---

## 成功指标（KPI）

### 30 天目标（M1-M4 完成后）

| 指标 | 目标 |
|------|------|
| npm 周下载量（@alephant/mcp） | 100+ |
| Smithery 安装数 | 50+ |
| GitHub Stars（alephant-mcp 仓库） | 50+ |
| PyPI 周下载量（alephant-langchain） | 50+ |
| 接入文档访问量 | 500+ UV |

### 90 天目标（稳定运营后）

| 指标 | 目标 |
|------|------|
| npm 周下载量 | 1,000+ |
| Smithery 安装数 | 500+ |
| GitHub Stars | 200+ |
| PyPI 周下载量（LangChain + LlamaIndex 合计） | 500+ |
| LangChain 官方 PR 合并 | ✅ |
| 来自 MCP / Python SDK 渠道的新注册用户 | 可追踪（UTM 参数） |

---

## Track 3：低优先级平台（规划中，最后实现）

Track 1 + Track 2 全部完成并验证用户增长后，再启动以下平台的接入。**不排期，不阻塞主轨。**

---

### 阶段 3.1 — CrewAI Python Integration

**目标用户：** Multi-Agent 框架开发者，关注多智能体协作场景下的费用追踪  
**GitHub Stars：** 25K-45K  
**接入类型：** Python Integration / Callback  
**估时：** 3-5 人天  

**集成方式：** 类似 LangChain SDK，提供 Gateway 路由封装，让 CrewAI 的 LLM 调用经过 Alephant Gateway，自动执行策略并记录费用。

```python
from alephant_crewai import AlephantLLM
from crewai import Crew, Agent, Task

# CrewAI Agent 使用 Alephant Gateway 路由的 LLM
llm = AlephantLLM(virtual_key="vk-your-key-here", model="gpt-4o")
agent = Agent(role="Researcher", llm=llm, ...)
crew = Crew(agents=[agent], tasks=[...])
crew.kickoff()
```

**提交路径：** 向 CrewAI 官方 integrations 目录提 PR。

**启动条件：** LangChain SDK 周下载量达到 500+，或有 Multi-Agent 企业客户明确提出需求。

---

### 阶段 3.2 — n8n Custom Node

**目标用户：** 自动化工程师、无代码/低代码工作流用户  
**GitHub Stars：** 68K  
**接入类型：** Custom Node（TypeScript，与 `@alephant/mcp` 同语言）  
**估时：** 10-14 人天（最高，需遵循 n8n 节点开发规范）

**集成方式：** 开发 `n8n-nodes-alephant` npm 包，提供以下节点：

| 节点名 | 功能 |
|--------|------|
| `Alephant: Get Usage Summary` | 查询虚拟密钥使用摘要 |
| `Alephant: List Virtual Keys` | 列出工作区下所有虚拟密钥 |
| `Alephant: Check Budget` | 检查预算使用率，可接自动化告警流程 |

**提交路径：** 发布到 npm，提交到 n8n community node registry。

**启动条件：** 有≥3 个企业客户在自动化工作流场景有明确需求，或销售反馈 n8n 是客户常用工具。

---

### 阶段 3.3 — Dify.ai Plugin

**目标用户：** 低代码 AI 应用构建者，使用 Dify 搭建 LLM 应用  
**GitHub Stars：** 114K-130K  
**接入类型：** Dify Plugin（遵循 Dify Plugin SDK）  
**估时：** 5-7 人天

**集成方式：** 开发 Dify 插件，提供 Tool 节点，让 Dify 工作流可以：
- 在应用调用 LLM 后查询费用归因
- 在工作流中触发预算告警
- 展示当前虚拟密钥余量

**提交路径：** 提交到 Dify Marketplace。

**启动条件：** 有 Dify 用户反馈，或 Dify Plugin 市场成熟度达到可发现性要求（Dify 插件生态目前仍在快速演进）。

---

### Track 3 优先级排序说明

| 平台 | 优先级 | 原因 |
|------|--------|------|
| CrewAI | 3.1（最先） | Python 生态，与 Track 2 技术栈完全复用；工作量最小（3-5 天） |
| Dify.ai | 3.2（次之） | Stars 最高（114K），插件市场影响力强；但插件生态还在演进 |
| n8n | 3.3（最后） | 工作量最大（10-14 天）；目标用户与 Alephant 核心受众（AI 开发者）差距较大 |

---

## 其他备选平台（暂不规划）

以下平台暂无明确规划，根据市场反馈决定：

| 平台 | 接入类型 | 估时 | 备注 |
|------|---------|------|------|
| Open WebUI | Tool/Function Plugin | 3-5 天 | 自托管社区，Stars 124K，但转化率待验证 |
| Semantic Kernel | C#/Python Plugin | 5-7 天 | 微软生态，目标企业客户，但 C# 技术栈需专门维护 |
| Zapier / Make | App 集成 | 10-14 天 | 非技术用户，与 Alephant 受众错位明显 |

---

## 风险与依赖

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| alephant-mcp 核心功能未完成 | Track 1.0 无法启动 | 设置内部 alpha 测试里程碑作为前置门槛 |
| LangChain 官方 PR review 周期长（2-6 周） | M5 推迟 | PR 提交后不阻塞其他工作；PyPI 发布不依赖官方合并 |
| AI Gateway 未部署或 URL 未确定 | Python SDK 无法路由 LLM 请求 | SDK 支持 `gateway_url` 参数覆盖，开发期间可指向测试环境 Gateway |
| npm 包名 @alephant/mcp 组织未注册 | 无法发布到 npm | 提前注册 npm organization `alephant` |

---

## 附录：用户配置参考

### PAT 模式（管理员）

```json
{
  "mcpServers": {
    "alephant": {
      "command": "npx",
      "args": ["-y", "@alephant/mcp"],
      "env": {
        "ALEPHANT_PAT": "pat_wsa3f8c2_...",
        "ALEPHANT_BASE_URL": "https://api.alephant.ai"
      }
    }
  }
}
```

### VK 模式（开发者）

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

### Python SDK（LangChain）

```python
from alephant_langchain import ChatAlephant

# LLM 调用自动路由到 Alephant Gateway，策略执行 + 费用自动归因
llm = ChatAlephant(virtual_key="vk-your-key-here", model="gpt-4o")
response = llm.invoke("Hello!")
```

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-04-01 | 初稿：确定方案 B（双轨并行），完整路线图、工作量估算与里程碑。 |
| 2026-04-01 | 新增 Track 3（低优先级）：CrewAI / n8n / Dify 写入规划，含启动条件与优先级排序；其余平台移至「备选」节。 |
| 2026-04-01 | **Review 修正**：① Track 2 SDK 职责从「数据上报」改为「Gateway 路由 + FinOps 查询」——VK 请求经 Gateway 自动采集，SDK 无需 POST；② 移除 `POST /cockpit/usage-summary` 引用；③ LangChain/LlamaIndex SDK 改为继承原生 LLM 类并设置 Gateway 路由；④ Track 1.0 前置条件显式标注依赖链与相对时间；⑤ 风险表更新（Cockpit POST → Gateway 部署）。 |
