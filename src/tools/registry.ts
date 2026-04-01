import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthMode } from "../auth/types.js";
import type { ToolDeps } from "./deps.js";
import { registerSharedUsageTools } from "./shared/usage.js";
import { registerListAvailableModels } from "./shared/models.js";
import { registerVkScopeTools } from "./vk/scope.js";
import { registerVkBudgetTools } from "./vk/budget.js";
import { registerManagerKeyTools } from "./manager/keys.js";
import { registerManagerAnalyticsTools } from "./manager/analytics.js";
import { registerManagerAgentTools } from "./manager/agents.js";
import { registerManagerDepartmentTools } from "./manager/departments.js";
import { registerManagerPolicyTools } from "./manager/policies.js";

/** Registers 7 tools in vk mode, 15 in manager mode (18 unique names total; shared count twice). */
export function registerTools(server: McpServer, mode: AuthMode, deps: ToolDeps): void {
  registerSharedUsageTools(server, deps);
  registerListAvailableModels(server, deps);

  if (mode === "vk") {
    registerVkScopeTools(server, deps);
    registerVkBudgetTools(server, deps);
    return;
  }

  registerManagerKeyTools(server, deps);
  registerManagerAnalyticsTools(server, deps);
  registerManagerAgentTools(server, deps);
  registerManagerDepartmentTools(server, deps);
  registerManagerPolicyTools(server, deps);
}
