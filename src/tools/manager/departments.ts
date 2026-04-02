import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolDeps } from "../deps.js";
import { requireManager } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

export function registerManagerDepartmentTools(server: McpServer, deps: ToolDeps): void {
  server.tool("list_departments", {}, async () => {
    const manager = requireManager(deps);
    return safeCall(() => manager.listDepartments(), "manager");
  });

  server.tool(
    "get_department_analytics",
    {
      department_id: z.string().uuid(),
      period: z
        .enum(["24h", "7d", "30d"])
        .default("30d")
        .describe("Requested window (backend may return fixed billing window until extended)"),
    },
    async ({ department_id, period }) => {
      const manager = requireManager(deps);
      return safeCall(() => manager.getDepartmentAnalytics(department_id, period), "manager");
    },
  );
}
