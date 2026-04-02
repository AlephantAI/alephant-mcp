import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import axios from "axios";
import type { ToolDeps } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

const MODEL_API_TIMEOUT = 30_000;

class ConfigError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
    this.name = "ConfigError";
  }
}

async function fetchModelsList(deps: ToolDeps): Promise<unknown> {
  const root = deps.baseUrl.replace(/\/$/, "");
  const url = `${root}/api/v1/models`;
  if (deps.mode === "vk") {
    if (!deps.vk) throw new ConfigError("Virtual key missing", 401);
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${deps.vk}` },
      timeout: MODEL_API_TIMEOUT,
    });
    return data;
  }
  if (!deps.pat) throw new ConfigError("PAT missing", 401);
  const headers: Record<string, string> = { Authorization: `Bearer ${deps.pat}` };
  if (deps.workspaceId) headers["X-Workspace-Id"] = deps.workspaceId;
  const { data } = await axios.get(url, { headers, timeout: MODEL_API_TIMEOUT });
  return data;
}

export function registerListAvailableModels(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "list_available_models",
    {},
    async () => safeCall(() => fetchModelsList(deps), deps.mode),
  );
}
