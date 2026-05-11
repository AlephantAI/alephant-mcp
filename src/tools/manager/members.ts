import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolDeps } from "../deps.js";
import { requireManager } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

export function registerManagerMemberTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "list_members",
    "Lists workspace members so user-level analytics tools can be called with concrete member IDs.",
    {
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(200).default(100),
    },
    async ({ page, page_size }) => {
      const manager = requireManager(deps);
      return safeCall(() => manager.listMembers(page, page_size), "manager");
    },
  );
}
