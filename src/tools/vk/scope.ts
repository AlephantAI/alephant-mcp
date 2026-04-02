import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolDeps } from "../deps.js";
import { requireCockpit } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

export function registerVkScopeTools(server: McpServer, deps: ToolDeps): void {
  server.tool("get_my_scope", {}, async () => {
    const cockpit = requireCockpit(deps);
    return safeCall(() => cockpit.scope(), "vk");
  });
}
