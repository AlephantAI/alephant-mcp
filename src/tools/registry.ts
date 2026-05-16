import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
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

const TOOL_DESCRIPTIONS: Record<string, string> = {
  check_alephant_connection:
    "Checks Alephant API connectivity and credential usability for the current MCP mode.",
  get_usage_summary:
    "Returns total spend, requests, and token usage for the selected period.",
  get_daily_costs:
    "Returns daily AI spend for the selected period.",
  get_cost_by_model:
    "Breaks down AI spend and request volume by model for the selected period.",
  list_available_models:
    "Lists models available through Alephant for the current credential scope.",
  get_my_scope:
    "Returns the current virtual key scope, limits, and accessible resources.",
  get_my_budget:
    "Returns budget status for the current virtual key.",
  get_my_recent_requests:
    "Returns recent requests made with the current virtual key.",
  list_virtual_keys:
    "Lists virtual keys in the current Alephant workspace.",
  create_virtual_key:
    "Creates a virtual key in the current workspace. Requires explicit user confirmation before calling.",
  update_key_budget:
    "Updates the budget and enforcement action for an existing virtual key. Requires explicit user confirmation before calling.",
  revoke_virtual_key:
    "Revokes an existing virtual key. Requires explicit user confirmation before calling.",
  get_workspace_overview:
    "Returns workspace-level spend, request, token, and budget overview metrics.",
  get_workspace_budget_status:
    "Returns the current workspace budget status and enforcement configuration.",
  list_agents:
    "Lists agents configured in the current Alephant workspace.",
  get_agent_analytics:
    "Returns spend and usage analytics for a specific agent.",
  list_members:
    "Lists members in the current Alephant workspace.",
  get_member_analytics:
    "Returns spend and usage analytics for a specific workspace member.",
  list_departments:
    "Lists departments in the current Alephant workspace.",
  get_department_analytics:
    "Returns spend and usage analytics for a specific department.",
  get_subscription_info:
    "Returns current subscription and plan information for the workspace.",
  set_budget_policy:
    "Updates the workspace budget policy and enforcement action. Requires explicit user confirmation before calling.",
  get_live_24h:
    "Returns live workspace spend and request metrics for the last 24 hours.",
  get_usage_timeseries:
    "Returns time-series usage and cost data for a selected metric and period.",
  get_sparklines:
    "Returns compact sparkline data for workspace spend and usage trends.",
  diagnose_cost_anomaly:
    "Compares recent spend against the previous period and highlights cost anomalies.",
  get_executive_dashboard:
    "Returns a compact executive dashboard with realtime, trend, and overview metrics.",
  drill_down_spend:
    "Breaks down spend by workspace dimension such as model, agent, member, or department.",
  find_idle_resources:
    "Finds agents, virtual keys, or other resources with low or stale usage.",
  compare_entity_periods:
    "Compares spend and usage for an entity across two adjacent periods.",
};

const WRITE_TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  create_virtual_key: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  update_key_budget: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  revoke_virtual_key: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  set_budget_policy: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function toolTitle(name: string): string {
  return name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function annotationsForTool(name: string): ToolAnnotations {
  return {
    title: toolTitle(name),
    ...(WRITE_TOOL_ANNOTATIONS[name] ?? READ_ONLY_ANNOTATIONS),
  };
}

function isToolAnnotations(value: unknown): value is ToolAnnotations {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return ["title", "readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"].some(
    (key) => key in value,
  );
}

function installMarketplaceMetadata(server: McpServer): () => void {
  const serverWithTool = server as McpServer & { tool: (...args: unknown[]) => unknown };
  const originalTool = serverWithTool.tool.bind(server);

  serverWithTool.tool = (nameValue: unknown, ...args: unknown[]) => {
    if (typeof nameValue !== "string") {
      return originalTool(nameValue, ...args);
    }

    const cb = args.at(-1);
    if (typeof cb !== "function") {
      return originalTool(nameValue, ...args);
    }

    const name = nameValue;
    const description = TOOL_DESCRIPTIONS[name];
    const annotations = annotationsForTool(name);
    if (!description) {
      return originalTool(name, ...args);
    }

    const metadataArgs = args.slice(0, -1);
    if (metadataArgs.length === 0) {
      return originalTool(name, description, annotations, cb);
    }

    if (metadataArgs.length === 1) {
      const [first] = metadataArgs;
      if (typeof first === "string") {
        return originalTool(name, first || description, annotations, cb);
      }
      if (isToolAnnotations(first)) {
        return originalTool(name, description, { ...annotations, ...first }, cb);
      }
      return originalTool(name, description, first, annotations, cb);
    }

    if (metadataArgs.length === 2) {
      const [first, second] = metadataArgs;
      if (typeof first === "string") {
        if (isToolAnnotations(second)) {
          return originalTool(name, first || description, { ...annotations, ...second }, cb);
        }
        return originalTool(name, first || description, second, annotations, cb);
      }
      if (isToolAnnotations(second)) {
        return originalTool(name, first, { ...annotations, ...second }, cb);
      }
      return originalTool(name, ...args);
    }

    if (metadataArgs.length === 3) {
      const [first, second, third] = metadataArgs;
      if (typeof first === "string" && isToolAnnotations(third)) {
        return originalTool(name, first || description, second, { ...annotations, ...third }, cb);
      }
    }

    return originalTool(name, ...args);
  };

  return () => {
    serverWithTool.tool = originalTool;
  };
}

/** Registers 8 tools in vk mode, 27 in manager mode (30 unique names total; shared tools in both). */
export function registerTools(server: McpServer, mode: AuthMode, deps: ToolDeps): void {
  const restoreTool = installMarketplaceMetadata(server);
  try {
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
  } finally {
    restoreTool();
  }
}
