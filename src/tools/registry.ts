import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthMode } from "../auth/types.js";
import type { ToolDeps } from "./deps.js";
import { registerConnectionHealthTool } from "./shared/health.js";
import { registerSharedUsageTools } from "./shared/usage.js";
import { registerListAvailableModels } from "./shared/models.js";
import { registerVkScopeTools } from "./vk/scope.js";
import { registerVkBudgetTools } from "./vk/budget.js";
import { registerManagerKeyTools } from "./manager/keys.js";
import { registerManagerAnalyticsTools } from "./manager/analytics.js";
import { registerManagerAgentTools } from "./manager/agents.js";
import { registerManagerMemberTools } from "./manager/members.js";
import { registerManagerDepartmentTools } from "./manager/departments.js";
import { registerManagerPolicyTools } from "./manager/policies.js";
import { registerManagerAtomicTools } from "./manager/analytics-atomic.js";
import { registerManagerCompositeTools } from "./manager/analytics-composite.js";

/** Registers 8 tools in vk mode, 27 in manager mode (30 unique names total; shared tools in both). */
export function registerTools(server: McpServer, mode: AuthMode, deps: ToolDeps): void {
  registerConnectionHealthTool(server, deps);
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
  registerManagerMemberTools(server, deps);
  registerManagerDepartmentTools(server, deps);
  registerManagerPolicyTools(server, deps);
  registerManagerAtomicTools(server, deps);
  registerManagerCompositeTools(server, deps);
}
