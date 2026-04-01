# Alephant 平台集成指南

本文档介绍如何将 Alephant MCP Server 接入 n8n、扣子（Coze）等自动化平台作为节点使用。

---

## 目录

1. [架构概览](#架构概览)
2. [接入 n8n](#接入-n8n)
   - [方案 A: HTTP Request 节点调用](#方案-a-http-request-节点调用)
   - [方案 B: 创建 n8n 自定义节点库](#方案-b-创建-n8n-自定义节点库)
3. [接入扣子 Coze](#接入-扣子-coze)
   - [方案 A: API 插件](#方案-a-api-插件)
   - [方案 B: 自定义插件](#方案-b-自定义插件)
4. [API 参考](#api-参考)

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                      自动化平台层                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │   n8n    │  │  扣子    │  │  Flowise │  │ 其他平台 │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
└───────┼─────────────┼─────────────┼─────────────┼───────────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Alephant API 层                               │
│  /api/cockpit/scope  │ /api/cockpit/dashboard │ /api/cockpit/policy │
└─────────────────────────────────────────────────────────────────┘
```

Alephant 提供的核心能力：
- **预算状态查询** (`get_budget_status`)
- **成本归因分析** (`list_virtual_keys`)
- **成本策略执行** (`apply_cost_policy`)
- **审计报告生成** (`cost_audit_report`)

---

## 接入 n8n

### 方案 A: HTTP Request 节点调用

最简单的方式，通过 n8n 内置的 HTTP Request 节点直接调用 Alephant 后端 API。

#### 前提条件

1. 已部署 Alephant 后端服务
2. 获取 Virtual Key 用于身份认证

#### 步骤 1: 配置 HTTP Request 节点

在 n8n 工作流中添加 **HTTP Request** 节点，配置如下：

**获取预算状态**

```
Method: GET
URL: {{ $env.ALEPHANT_API_BASE_URL }}/api/cockpit/dashboard
Headers:
  Authorization: Bearer {{ $env.ALEPHANT_VIRTUAL_KEY }}
  X-Alephant-Virtual-Key: {{ $env.ALEPHANT_VIRTUAL_KEY }}
  Content-Type: application/json
```

#### 步骤 2: 在 n8n 中配置环境变量

在 n8n 的设置中添加环境变量：

| 变量名 | 值 |
|--------|-----|
| ALEPHANT_API_BASE_URL | `https://api.example.com` |
| ALEPHANT_VIRTUAL_KEY | `your-virtual-key-here` |

#### 示例工作流

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Trigger    │───▶│  HTTP Request     │───▶│  Slack/Email    │
│  (Schedule) │    │  (Get Dashboard)  │    │  (Send Alert)   │
└─────────────┘    └──────────────────┘    └─────────────────┘
```

#### 完整示例 JSON

```json
{
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "cron",
              "expression": "0 * * * *"
            }
          ]
        }
      },
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger"
    },
    {
      "parameters": {
        "method": "GET",
        "url": "={{ $env.ALEPHANT_API_BASE_URL }}/api/cockpit/dashboard",
        "options": {
          "headers": {
            "entries": [
              {
                "name": "Authorization",
                "value": "Bearer {{ $env.ALEPHANT_VIRTUAL_KEY }}"
              },
              {
                "name": "X-Alephant-Virtual-Key",
                "value": "{{ $env.ALEPHANT_VIRTUAL_KEY }}"
              }
            ]
          }
        }
      },
      "name": "Get Alephant Dashboard",
      "type": "n8n-nodes-base.httpRequest"
    },
    {
      "parameters": {
        "webhookUri": "https://hooks.slack.com/services/xxx",
        "data": {
          "channel": "#finops-alerts",
          "text": "Budget Alert: {{ $json.costHistoryPercent }}% used"
        }
      },
      "name": "Send Slack Alert",
      "type": "n8n-nodes-base.slack"
    }
  ],
  "connections": {
    "Schedule Trigger": {
      "main": [["Get Alephant Dashboard"]]
    },
    "Get Alephant Dashboard": {
      "main": [["Send Slack Alert"]]
    }
  }
}
```

---

### 方案 B: 创建 n8n 自定义节点库

创建专门的 `n8n-nodes-alephant` 包，提供原生节点体验。

#### 项目结构

```
n8n-nodes-alephant/
├── src/
│   ├── index.ts           # 入口
│   ├── Alephant.node.ts   # 节点定义
│   ├── credentials.ts     # 凭证定义
│   └── api.ts             # API 客户端
├── package.json
└── tsconfig.json
```

#### 安装依赖

```bash
npm install n8n-workflow n8n-core
```

#### 节点定义示例

```typescript
// src/Alephant.node.ts
import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodePropertyOptions,
} from "n8n-workflow";

export class AlephantNode implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Alephant FinOps",
    name: "alephant",
    icon: "file:alephant.svg",
    group: ["organization"],
    version: 1,
    subtitle: '="{{ $parameter.resource }} - {{ $parameter.operation }}"',
    description: "AI FinOps Governance - Budget monitoring and cost control",
    defaults: { name: "Alephant" },
    inputs: ["main"],
    outputs: ["main"],
    credentials: [{ name: "alephantApi", required: true }],
    properties: [
      {
        displayName: "Resource",
        name: "resource",
        type: "options",
        options: [
          { name: "Budget", value: "budget" },
          { name: "Attribution", value: "attribution" },
          { name: "Policy", value: "policy" },
        ],
        default: "budget",
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        options: [
          { name: "Get Status", value: "getStatus" },
          { name: "Get Live Metrics", value: "getLiveMetrics" },
        ],
        default: "getStatus",
      },
    ],
  };

  async execute(this: IExecuteFunctions) {
    const item = this.getInputData();
    const resource = this.getNodeParameter("resource", 0) as string;
    const operation = this.getNodeParameter("operation", 0) as string;
    
    // 获取凭证
    const credentials = await this.getCredentials("alephantApi");
    
    // 调用 Alephant API
    // ... 实现细节
  }
}
```

#### 凭证定义

```typescript
// src/credentials.ts
import { ICredentialType, INodeProperties } from "n8n-workflow";

export class AlephantApiCredential implements ICredentialType {
  name = "alephantApi";
  displayName = "Alephant API";
  documentationUrl = "https://docs.alephant.example.com";
  properties: INodeProperty[] = [
    {
      name: "apiBaseUrl",
      type: "string",
      required: true,
      placeholder: "https://api.example.com",
    },
    {
      name: "virtualKey",
      type: "string",
      typeOptions: { password: true },
      required: true,
      placeholder: "your-virtual-key",
    },
  ];
}
```

#### 发布节点

```bash
npm publish
```

安装自定义节点：

```bash
npm install n8n-nodes-alephant
```

---

## 接入扣子 Coze

### 方案 A: API 插件

通过扣子的 API 插件功能，直接调用 Alephant 后端 REST API。

#### 步骤 1: 创建 API 插件

1. 登录 [扣子平台](https://coze.cn)
2. 进入 **插件** > **创建插件**
3. 选择 **API 导入** 方式

#### 步骤 2: 配置 API Schema

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "Alephant FinOps",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "{{env.ALEPHANT_API_BASE_URL}}"
    }
  ],
  "paths": {
    "/api/cockpit/dashboard": {
      "get": {
        "operationId": "getDashboard",
        "summary": "获取预算仪表盘",
        "security": [{ "ApiKeyAuth": [] }],
        "responses": {
          "200": {
            "description": "成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "costHistoryPercent": {
                      "type": "array",
                      "items": { "type": "number" }
                    },
                    "runtimeEstDays": { "type": "number" },
                    "burnRatePerHour": { "type": "number" },
                    "attributionItems": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "name": { "type": "string" },
                          "costUsd": { "type": "number" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/cockpit/policy": {
      "post": {
        "operationId": "applyPolicy",
        "summary": "应用成本策略",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "action": {
                    "type": "string",
                    "enum": ["low-cost", "high-performance", "block"]
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "成功"
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "ApiKeyAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "X-Alephant-Virtual-Key"
      }
    }
  }
}
```

#### 步骤 3: 配置环境变量

在扣子 Bot 设置中配置：

| 变量名 | 说明 |
|--------|------|
| ALEPHANT_API_BASE_URL | Alephant 后端地址 |
| ALEPHANT_VIRTUAL_KEY | 虚拟密钥 |

#### 步骤 4: 在 Bot 中使用

创建 Bot 时，将 Alephant 插件添加到 Bot 的技能中。

---

### 方案 B: 自定义插件

如果需要更精细的控制，可以创建完整的自定义插件。

#### 项目结构

```
coze-plugin-alephant/
├── src/
│   └── index.ts          # 插件入口
├── manifest.json          # 插件配置
└── package.json
```

#### manifest.json

```json
{
  "schema_version": "v1",
  "name_for_human": "Alephant FinOps",
  "name_for_model": "alephant_finops",
  "description_for_human": "AI FinOps 治理工具，用于预算监控和成本控制",
  "description_for_model": "用于查询 AI 成本、监控预算、执行成本策略",
  "auth": {
    "type": "api_key",
    "api_key_header": "X-Alephant-Virtual-Key"
  },
  "env_vars": [
    {
      "name": "ALEPHANT_API_BASE_URL",
      "description": "Alephant 后端 API 地址"
    }
  ],
  "tools": [
    {
      "name": "get_budget_status",
      "description": "获取当前预算状态和剩余额度",
      "parameters": {
        "type": "object",
        "properties": {
          "department": {
            "type": "string",
            "description": "部门名称（可选）"
          }
        }
      }
    },
    {
      "name": "list_virtual_keys",
      "description": "列出当前 scope 下的所有虚拟 Key 及消耗归因"
    },
    {
      "name": "apply_cost_policy",
      "description": "应用成本策略：切换到低成本模式、恢复高性能、或熔断",
      "parameters": {
        "type": "object",
        "required": ["policy"],
        "properties": {
          "policy": {
            "type": "string",
            "enum": ["low-cost", "high-performance", "block"],
            "description": "策略类型"
          }
        }
      }
    }
  ]
}
```

#### 插件实现示例

```typescript
// src/index.ts
import type { PluginRequest } from "@coze/api";

interface BudgetStatusResult {
  remaining: number;
  percent: number;
  burnRate: number;
}

export async function handleRequest(req: PluginRequest) {
  const { action, params, env } = req;
  
  const baseUrl = env.ALEPHANT_API_BASE_URL;
  const apiKey = env.ALEPHANT_VIRTUAL_KEY;
  
  const headers = {
    "Content-Type": "application/json",
    "X-Alephant-Virtual-Key": apiKey,
  };

  switch (action) {
    case "get_budget_status":
      const [scope, dashboard, live] = await Promise.all([
        fetch(`${baseUrl}/api/cockpit/scope`, { headers }),
        fetch(`${baseUrl}/api/cockpit/dashboard`, { headers }),
        fetch(`${baseUrl}/api/cockpit/live-metrics`, { headers }),
      ]);
      return {
        success: true,
        data: {
          remaining: live.remainingPercent,
          percent: live.percent,
          burnRate: live.burnRate,
          topConsumer: dashboard.attributionItems?.[0]?.name,
        },
      };

    case "apply_cost_policy":
      const res = await fetch(`${baseUrl}/api/cockpit/policy`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: params.policy }),
      });
      return { success: res.ok, message: "Policy applied" };

    default:
      return { success: false, error: "Unknown action" };
  }
}
```

---

## API 参考

### 端点列表

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/cockpit/scope` | 获取当前 scope（工作区/部门/Agent） |
| GET | `/api/cockpit/dashboard` | 获取仪表盘数据 |
| GET | `/api/cockpit/live-metrics` | 获取实时指标 |
| POST | `/api/cockpit/policy` | 应用成本策略 |

### 认证方式

所有 API 请求需要携带以下 Header：

```
Authorization: Bearer {VIRTUAL_KEY}
X-Alephant-Virtual-Key: {VIRTUAL_KEY}
```

### 响应格式

**Dashboard 响应**

```json
{
  "costHistoryPercent": [45, 52, 58, 65.42],
  "runtimeEstDays": 15,
  "burnRatePerHour": 2.3,
  "attributionItems": [
    { "name": "Axpha-Trader", "costUsd": 25.50 },
    { "name": "Code-Reviewer", "costUsd": 8.25 }
  ]
}
```

**Policy 请求体**

```json
{
  "action": "low-cost" | "high-performance" | "block"
}
```

**Policy 响应**

```json
{
  "ok": true,
  "message": "Policy applied successfully"
}
```

---

## 下一步

1. 部署 Alephant 后端服务
2. 选择适合的集成方案
3. 配置认证信息
4. 在工作流中使用 Alephant 节点

如需帮助，请参考 Alephant 主文档或提交 Issue。
