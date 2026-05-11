import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolDeps } from "../deps.js";
import { requireCockpit, requireManager } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

export function registerConnectionHealthTool(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "check_alephant_connection",
    "Checks Alephant API connectivity and credential usability for the current MCP mode.",
    {},
    async () => {
      if (deps.mode === "vk") {
        const cockpit = requireCockpit(deps);
        return safeCall(async () => ({
          mode: "vk",
          status: "ok",
          health: await cockpit.health(),
        }), deps.mode);
      }

      const manager = requireManager(deps);
      return safeCall(async () => ({
        mode: "manager",
        status: "ok",
        workspaceId: manager.getWorkspaceId(),
        overview: await manager.getWorkspaceOverview(),
      }), deps.mode);
    },
  );
}
