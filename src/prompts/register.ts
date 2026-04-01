import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthMode } from "../auth/types.js";
import { registerCostAuditPrompt } from "./cost-audit.js";
import { registerCostOptimizationPrompt } from "./optimization.js";

export function registerPrompts(server: McpServer, mode: AuthMode): void {
  registerCostAuditPrompt(server, mode);
  if (mode === "manager") {
    registerCostOptimizationPrompt(server);
  }
}
