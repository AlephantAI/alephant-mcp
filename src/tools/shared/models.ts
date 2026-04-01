import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import axios from "axios";
import type { ToolDeps } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

/**
 * GET /api/v1/models — not under /cockpit; separate request per auth mode.
 */
async function fetchModelsList(deps: ToolDeps): Promise<unknown> {
  const root = deps.baseUrl.replace(/\/$/, "");
  const url = `${root}/api/v1/models`;
  if (deps.mode === "vk") {
    if (!deps.vk) throw new Error("Virtual key missing");
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${deps.vk}` },
      timeout: 30_000,
    });
    return data;
  }
  if (!deps.pat) throw new Error("PAT missing");
  const headers: Record<string, string> = { Authorization: `Bearer ${deps.pat}` };
  if (deps.workspaceId) headers["X-Workspace-Id"] = deps.workspaceId;
  const { data } = await axios.get(url, { headers, timeout: 30_000 });
  return data;
}

export function registerListAvailableModels(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "list_available_models",
    {},
    async () => safeCall(() => fetchModelsList(deps), deps.mode),
  );
}
