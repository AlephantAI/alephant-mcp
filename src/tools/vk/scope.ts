import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolDeps } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

export function registerVkScopeTools(server: McpServer, deps: ToolDeps): void {
  server.tool("get_my_scope", {}, async () => {
    if (!deps.cockpit) throw new Error("Cockpit client not configured");
    return safeCall(() => deps.cockpit!.scope(), "vk");
  });
}
