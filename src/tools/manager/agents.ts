import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolDeps } from "../deps.js";
import { requireManager } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";
import type { AgentDeptPeriod } from "../../utils/analytics-period.js";

const agentPeriodSchema = z.enum(["24h", "7d", "30d"]).default("30d");

export function registerManagerAgentTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "list_agents",
    {
      department_id: z.string().uuid().optional().describe("Filter by department UUID"),
    },
    async ({ department_id }) => {
      const manager = requireManager(deps);
      return safeCall(() => manager.listAgents(department_id), "manager");
    },
  );

  server.tool(
    "get_agent_analytics",
    {
      agent_id: z.string().uuid(),
      period: agentPeriodSchema,
    },
    async ({ agent_id, period }) => {
      const manager = requireManager(deps);
      return safeCall(
        () => manager.getAgentAnalytics(agent_id, period as AgentDeptPeriod),
        "manager",
      );
    },
  );
}
