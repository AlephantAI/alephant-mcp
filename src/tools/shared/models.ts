import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolDeps } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

export function registerListAvailableModels(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "list_available_models",
    {},
    async () => {
      if (deps.mode === "vk") {
        if (!deps.cockpit) throw new Error("Cockpit client not configured");
        return safeCall(() => deps.cockpit!.listModels(), deps.mode);
      }
      if (!deps.manager) throw new Error("Manager client not configured");
      return safeCall(() => deps.manager!.listModels(), deps.mode);
    },
  );
}
