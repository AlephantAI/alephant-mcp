import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolDeps } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

export function registerManagerAnalyticsTools(server: McpServer, deps: ToolDeps): void {
  server.tool("get_workspace_overview", {}, async () => {
    if (!deps.manager) throw new Error("Manager client not configured");
    return safeCall(() => deps.manager!.getWorkspaceOverview(), "manager");
  });
}
