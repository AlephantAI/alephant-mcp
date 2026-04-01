
# **ALEPHANT**

## **AI FinOps 网关**

## **MCP 服务器技术指南**

**构建 Alephant MCP 服务器：架构、工具、技术栈、代码结构及部署指南**

**2026 年 2 月 28 日**

**机密 — 仅限内部使用**

---

## **1\. 什么是 MCP 以及为什么要为 Alephant 构建它**

## **1.1 什么是 MCP**

**模型上下文协议 (Model Context Protocol, MCP)** 是 Anthropic 在 2024 年底创建的一种开放标准，它定义了 AI 助手如何与外部工具和数据源进行通信。它为 AI 模型提供了一种标准化的方式来发现、理解和使用外部功能，而无需进行自定义集成。

你可以把 MCP 想象成 **AI 界的通用插件系统**。就像 USB-C 让你可以用一根线连接任何设备和电脑一样，MCP 让任何 AI 工具都能通过一种协议连接到任何服务。AI 工具（称为“宿主”或“客户端”）会发现你的服务器能做什么，并在用户需要时调用这些功能。

## **1.2 为什么这对 Alephant 至关重要**

构建 Alephant MCP 服务器意味着，开发者在使用 **Claude Desktop、Cursor、Windsurf、VS Code Copilot、ChatGPT** 或任何其他兼容 MCP 的工具时，都可以使用自然语言与他们的 Alephant 控制面板进行交互。他们无需切换到浏览器查看成本，只需直接询问 AI 助手。

**真实场景案例**

一名开发者正在 Cursor 中编写代码，想要检查 AI 支出。他输入：“我这周在 GPT-4 上花了多少钱？” —— Cursor 调用 Alephant MCP 服务器，服务器查询 Alephant API 并返回：“您本周在 GPT-4 上通过 1,247 次请求共花费了 47.23 美元，比上周减少了 12%。” **无需切换标签页，无需登录后台，在工作流中即时获取答案。**

## **1.3 MCP 架构的工作原理**

MCP 采用客户端-服务器架构，分为三层：

| 组件 | 定义 | 示例 |
| :---- | :---- | :---- |
| **MCP 宿主 (Host)** | 开发者使用的 AI 应用程序 | Claude Desktop, Cursor, Windsurf, VS Code Copilot, ChatGPT |
| **MCP 客户端 (Client)** | 内置于宿主中；连接到 MCP 服务器 | 由宿主应用程序自动管理 |
| **MCP 服务器 (Server)** | 暴露 Alephant 功能的服务器 | 我们正在构建的 alephant-mcp 服务器 |

**通信流程如下：**

1. 开发者在 AI 工具中提出问题（如：“检查我的 AI 支出”）。  
2. AI 模型识别出需要外部数据，并调用相应的 MCP 工具。  
3. MCP 客户端将请求发送给 Alephant MCP 服务器。  
4. Alephant MCP 服务器查询 Alephant API 并返回结构化数据。  
5. AI 模型格式化响应并展示给开发者。

## **1.4 MCP 服务器功能**

MCP 服务器可以暴露三种类型的功能：

| 功能 | 作用 | Alephant 应用场景 |
| :---- | :---- | :---- |
| **工具 (Tools)** | AI 可以执行的函数（动作、查询、副作用） | 获取用量数据、创建 API 密钥、设置告警 —— **这是我们要构建的 90% 内容** |
| **资源 (Resources)** | 客户端可以向用户或模型展示的只读数据 | 当前价格列表、模型目录、账户设置 |
| **提示词 (Prompts)** | 预写的模板，帮助用户完成特定任务 | “成本优化报告”提示词，自动拉取所有相关数据 |

对于 Alephant，我们将主要构建 **工具**（核心功能）和少量 **资源**（只读参考数据，如模型目录）。

## **1.5 2026 年 MCP 的规模**

MCP 的采用正处于爆发式增长中。截至 2026 年初，社区构建的 MCP 服务器已超过 8,600 个。几乎所有主流 AI 工具都支持 MCP。这意味着构建一个 MCP 服务器，就能让 Alephant 同时分发到所有这些平台。

---

## **2\. 技术栈与要求**

## **2.1 语言选择：TypeScript**

推荐使用 **TypeScript**。官方 MCP SDK 以 TypeScript 为主，Alephant 产品本身也基于 JavaScript，开发者社区更倾向于使用 TypeScript 构建工具。官方 SDK 在 npm 上发布为 @modelcontextprotocol/sdk。

## **2.2 核心依赖包**

| 包名 | 用途 | 版本说明 |
| :---- | :---- | :---- |
| @modelcontextprotocol/sdk | 官方 SDK —— 构建服务器的核心框架 | 生产环境推荐 v1.x (稳定版) |
| zod | 输入验证库 —— SDK 的强制依赖 | v3.25+ 以保证兼容性 |
| express | Web 服务框架 —— 用于远程 HTTP 传输 | 配合 SDK 的 Express 中间件使用 |
| @modelcontextprotocol/express | 官方 SDK 的 Express 适配器 | 将 MCP 接入 Express 的薄封装层 |
| dotenv | 环境变量管理 | 用于管理 API 密钥 |
| express-rate-limit | 频率限制中间件 | 防止远程 HTTP 端点被滥用 |

## **2.3 传输选项 (Transport)**

MCP 服务器通过“传输层”与客户端通信。支持以下两种方式：

| 传输方式 | 工作原理 | 适用场景 | Alephant 的应用 |
| :---- | :---- | :---- | :---- |
| **Stdio (本地)** | 运行在本地机器，通过 stdin/stdout 通信。 | 本地开发、个人设置、CLI 工具 | 发布到 npm 供开发者通过 npx 安装 |
| **Streamable HTTP (远程)** | 运行在服务器上，支持双向通信。 | 团队部署、生产环境、托管服务 | 部署在 mcp.alephant.ai |

**关于 SSE 的重要说明**

旧的 SSE (Server-Sent Events) 传输现已被视为遗留技术。MCP 规范已于 2025 年 3 月转向 **Streamable HTTP**。它使用单一 /mcp 端点，简化了实现和部署。

## **2.4 开发工具**

* **MCP Inspector**：调试工具，用于手动调用工具并查看响应。  
* **Claude Desktop**：主要的测试环境。通过修改 claude\_desktop\_config.json 进行实战测试。  
* **Cursor / Windsurf**：验证跨客户端兼容性的辅助环境。  
* **tsx**：开发时直接运行 TypeScript 文件的工具。

## **2.5 身份验证**

开发者提供其 Alephant API 密钥进行身份验证：

* **Stdio 传输**：通过环境变量 (ALEPHANT\_API\_KEY) 传递。简单且安全，因为密钥留在开发者本地。  
* **远程 HTTP 传输**：使用 **OAuth 2.1**。MCP 规范包含标准的验证流程，开发者可以直接登录 Alephant 账户。

**认证建议：** 第 1-2 周先实现 API 密钥认证（针对 stdio 版本），第 3-4 周为远程 HTTP 版本添加 OAuth 2.1。

---

## **3\. 为 Alephant 构建的 MCP 工具**

我们推荐构建 12 个工具，分为 4 个类别。

## **3.1 类别 1：成本与用量工具【优先级：极高】**

这是最核心的价值点，覆盖 80% 的交互场景。

* **工具 1：get\_usage\_summary** —— 获取特定时段的总成本、Token 数和请求数。  
* **工具 2：get\_cost\_by\_model** —— 比较不同 AI 模型和供应商的支出。  
* **工具 3：get\_daily\_costs** —— 获取每日成本明细以进行趋势分析。  
* **工具 4：get\_request\_logs** —— 检索最近的 API 请求日志（含延迟、成本等）。

## **3.2 类别 2：密钥管理工具【优先级：高】**

对管理多个项目或客户的团队非常有价值。

* **工具 5：list\_virtual\_keys** —— 列出所有虚拟 API 密钥及其状态和用量。  
* **工具 6：create\_virtual\_key** —— 创建带有预算和频率限制的新虚拟密钥。  
* **工具 7：update\_key\_budget** —— 更新现有虚拟密钥的支出上限。  
* **工具 8：revoke\_virtual\_key** —— 立即停用某个虚拟密钥。

## **3.3 类别 3：模型与路由工具【优先级：中】**

利用 Alephant 的智能路由和多模型支持能力。

* **工具 9：list\_available\_models** —— 列出所有可用模型及其价格。  
* **工具 10：get\_model\_status** —— 检查供应商或模型的实时可用性和性能。  
* **工具 11：update\_fallback\_config** —— 设置或更新自动故障转移的模型后备链。

## **3.4 类别 4：告警与设置【优先级：低】**

* **工具 12：set\_budget\_alert** —— 当支出达到阈值时，创建通知告警。

---

## **4\. 项目结构与代码组织**

## **4.1 文件夹结构**

建议采用模块化组织方式：

Plaintext  
alephant-mcp/  
├── src/  
│   ├── index.ts           ← 入口：注册工具，启动服务  
│   ├── server.ts          ← McpServer 实例配置  
│   ├── tools/             ← 按类别划分工具逻辑  
│   │   ├── usage.ts  
│   │   └── keys.ts  
│   ├── api-client.ts      ← 统一的 Alephant API HTTP 客户端  
│   └── types.ts           ← TypeScript 接口定义  
├── Dockerfile             ← 用于远程部署  
└── README.md              ← 安装与使用文档

## **4.2 核心架构决策**

1. **工具注册与逻辑分离**：每个工具文件导出注册函数，保持 index.ts 整洁。  
2. **统一 API 客户端**：在 api-client.ts 中统一处理重试、错误处理和鉴权。  
3. **使用 Zod 进行输入验证**：为每个工具定义 Schema，实现自动验证和类型推断。  
4. **描述性的名称和说明**：AI 根据工具的 description 决定调用哪个工具，这是提高准确率的关键。  
5. **返回结构化数据**：工具应返回 JSON 对象，让 AI 模型根据语境决定如何向用户展示数据。

## **4.3 错误处理模式**

当工具操作失败时，应在响应中返回 isError: true，而不是抛出异常。这让 AI 模型能理解错误原因并告知用户。

---

## **5\. 部署与分发**

## **5.1 Stdio 分发 (npm)**

开发者通过在其 AI 工具的配置文件中添加以下内容来使用：

**Claude Desktop 配置示例：**

JSON  
{  
  "mcpServers": {  
    "alephant": {  
      "command": "npx",  
      "args": \["-y", "@alephant/mcp"\],  
      "env": {  
        "ALEPHANT\_API\_KEY": "your-api-key"  
      }  
    }  
  }  
}

## **5.2 远程 HTTP 部署**

将 MCP 服务器托管在生产环境（如 VPS 或 Kubernetes），地址设为 mcp.alephant.ai/mcp。这适合团队共享，无需在本地安装任何内容。

## **5.3 发布到 MCP 目录**

发布后，需在以下目录进行注册以提高曝光率：

* **MCP Server Directory** (modelcontextprotocol.io)  
* **Smithery** (流行的社区 MCP 目录)  
* **Glama** / **npm registry**

---

## **6\. 推荐构建时间表**

| 周次 | 交付物 | 细节 |
| :---- | :---- | :---- |
| **第 1 周** | 阶段 1 工具 \+ Stdio 传输 | 构建核心用量查询工具，发布 npm 测试版。录制演示视频。 |
| **第 2 周** | 阶段 2 工具 \+ 正式发布 | 构建密钥管理工具，发布 v1.0.0。编写完整文档。 |
| **第 3 周** | 远程 HTTP 传输 \+ 部署 | 添加 Express 支持，部署到 mcp.alephant.ai。 |
| **第 4 周** | 剩余工具 \+ OAuth | 添加路由和告警工具，实现 OAuth 登录。在各大目录注册。 |

## **6.1 营销里程碑**

* **第 1 周**：在 Twitter 发布 30 秒视频：“让 Claude 检查你的 AI 支出”。  
* **第 2 周**：发布博客文章：“从任何 AI 工具管理你的 AI 成本”。  
* **第 3 周**：教程视频：“如何在 2 分钟内将 Alephant 接入 Cursor”。

---

**大局观：**

MCP 服务器不仅是一个功能，它是一个**分发渠道**。安装了它的开发者在日常工作流中就能直接体验 Alephant 的价值。无需打开浏览器，无需登录后台，只需提问。这正是将免费用户转化为付费客户的最佳方式。