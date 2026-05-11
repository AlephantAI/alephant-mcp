import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolDeps } from "../deps.js";
import { requireManager } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

export function registerManagerAnalyticsTools(server: McpServer, deps: ToolDeps): void {
  server.tool("get_workspace_overview", {}, async () => {
    const manager = requireManager(deps);
    return safeCall(() => manager.getWorkspaceOverview(), "manager");
  });

  server.tool(
    "get_workspace_budget_status",
    "Returns workspace-level budget status from analytics, complementing VK-scoped budget checks.",
    {},
    async () => {
      const manager = requireManager(deps);
      return safeCall(() => manager.getWorkspaceBudgetStatus(), "manager");
    },
  );
}
