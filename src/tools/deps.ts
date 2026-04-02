import type { CockpitClient } from "../clients/cockpit-client.js";
import type { ManagerClient } from "../clients/manager-client.js";
import type { AuthMode } from "../auth/types.js";

export type ToolDeps = {
  mode: AuthMode;
  baseUrl: string;
  vk?: string;
  pat?: string;
  workspaceId?: string;
  cockpit: CockpitClient | null;
  manager: ManagerClient | null;
};

export function requireCockpit(deps: ToolDeps): CockpitClient {
  if (!deps.cockpit) throw new Error("Cockpit client not configured");
  return deps.cockpit;
}

export function requireManager(deps: ToolDeps): ManagerClient {
  if (!deps.manager) throw new Error("Manager client not configured");
  return deps.manager;
}
