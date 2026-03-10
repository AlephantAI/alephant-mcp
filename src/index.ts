#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * Alephant MCP Server - 驾驶舱增强版
 * 功能：工具集成 + 审计报告 Prompt + 调度支持
 */

// 1. 初始化 MCP 服务
const server = new McpServer({
  name: "Alephant-FinOps-Manager",
  version: "1.0.2",
});

/**
 * 工具 1: 查询预算状态
 */
server.tool(
  "get_budget_status",
  {
    workspaceId: z.string().describe("Alephant 工作区 ID"),
    department: z.string().optional().describe("部门名称"),
  },
  async ({ workspaceId, department }) => {
    try {
      // 模拟后端返回的深度 FinOps 数据
      const mockData = {
        total_budget: 100.0,
        current_spend: 65.42,
        prev_period_spend: 52.10, 
        remaining: 34.58,
        currency: "USD",
        top_consumer: "Axpha-Trader",
        status: "Normal",
      };

      return {
        content: [{ 
          type: "text", 
          text: `[预算看板] 剩余: ${mockData.remaining} ${mockData.currency} (已耗 ${mockData.current_spend}%)。
环比增长: +13.32%。最大消耗源: ${mockData.top_consumer}。状态: ${mockData.status}。` 
        }]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `获取预算失败: ${message}` }],
        isError: true,
      };
    }
  }
);

/**
 * 工具 2: 列出所有活跃的虚拟密钥
 */
server.tool(
  "list_virtual_keys",
  {
    workspaceId: z.string().describe("工作区 ID"),
  },
  async ({ workspaceId }) => {
    const keys = [
      { id: "v-key-001", agent: "Axpha-Trader", model: "gpt-4o", daily_limit: "10.00", usage: "High" },
      { id: "v-key-002", agent: "Code-Reviewer", model: "claude-3-5-sonnet", daily_limit: "5.00", usage: "Low" }
    ];

    return {
      content: [{ 
        type: "text", 
        text: `工作区 ${workspaceId} 活跃密钥分析：\n${keys.map(k => `- ${k.agent} [${k.model}]: 负载 ${k.usage}, 日限额 ${k.daily_limit}`).join("\n")}` 
      }]
    };
  }
);

/**
 * 工具 3: 调整策略 (下发干预)
 */
server.tool(
  "apply_cost_policy",
  {
    keyId: z.string().describe("需要管控的虚拟密钥 ID"),
    policy: z.enum(["low-cost", "high-performance", "block"]).describe("策略模式"),
  },
  async ({ keyId, policy }) => {
    return {
      content: [{ 
        type: "text", 
        text: `【策略下发成功】密钥 ${keyId} 已切换至 ${policy} 模式。后续请求将自动路由至低成本模型。` 
      }]
    };
  }
);

/**
 * 核心功能：审计报告提示词模板 (Prompts)
 * 对应方案 A：AI 调用此模板生成报告
 */
server.prompt(
  "cost_audit_report",
  {
    period: z.enum(["weekly", "monthly", "quarterly"]).default("weekly").describe("审计周期"),
    workspaceId: z.string().default("Axpha-Main").describe("工作区 ID"),
  },
  ({ period, workspaceId }) => {
    const periodMap = {
      weekly: "每周",
      monthly: "每月",
      quarterly: "每季度"
    };

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `你现在是 Alephant FinOps 审计专家。请为工作区 ${workspaceId} 生成一份详细的 ${periodMap[period]} 成本审计报告。

请按以下顺序执行任务：
1. 首先调用 get_budget_status 获取最新的预算消耗和趋势数据。
2. 接着调用 list_virtual_keys 分析哪些智能体产生了最高费用。
3. 结合数据进行诊断，如果环比增长超过 10%，请给出红色警告。
4. 最后输出一份 Markdown 报告，包含：核心结论、消耗画像、风险评估及建议。`
          }
        }
      ]
    };
  }
);

// 3. 启动逻辑
async function runServer() {
  // 命令行审计模式支持 (用于简单的本地 Cron 调用)
  if (process.argv.includes("--audit")) {
    console.log("--- Alephant 命令行审计报告 ---");
    console.log("当前状态: Normal | 预算剩余: 34.58 USD | 建议: 维持现状");
    process.exit(0);
  }

  // 正常 MCP 模式
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Alephant MCP Server (v1.0.2) 运行中...");
}

runServer().catch((error) => {
  console.error("启动失败:", error);
  process.exit(1);
});