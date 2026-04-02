import type { CockpitClient } from "../clients/cockpit-client.js";
import type { ManagerClient } from "../clients/manager-client.js";
import type { AuthMode } from "../auth/types.js";

export type ToolDeps = {
  mode: AuthMode;
  cockpit: CockpitClient | null;
  manager: ManagerClient | null;
};
