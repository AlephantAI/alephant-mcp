import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthMode } from "../auth/types.js";
import type { ToolDeps } from "./deps.js";
import { registerTools } from "./registry.js";

async function listRegisteredTools(mode: AuthMode) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  const deps: ToolDeps = {
    mode,
    cockpit: mode === "vk" ? ({} as ToolDeps["cockpit"]) : null,
    manager: mode === "manager" ? ({} as ToolDeps["manager"]) : null,
  };
  registerTools(server, mode, deps);

  const client = new Client({ name: "c", version: "0.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = await client.listTools();
    return result.tools;
  } finally {
    await client.close();
    await server.close();
  }
}

describe("registerTools", () => {
  it("registers the documented VK tool count", async () => {
    const tools = await listRegisteredTools("vk");
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "check_alephant_connection",
      "get_cost_by_model",
      "get_daily_costs",
      "get_my_budget",
      "get_my_recent_requests",
      "get_my_scope",
      "get_usage_summary",
      "list_available_models",
    ]);
  });

  it("registers the documented manager tool count", async () => {
    const tools = await listRegisteredTools("manager");
    expect(tools).toHaveLength(27);
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "check_alephant_connection",
        "get_workspace_budget_status",
        "list_members",
      ]),
    );
  });

  it("marks manager write operations as requiring explicit user confirmation", async () => {
    const tools = await listRegisteredTools("manager");
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const name of [
      "create_virtual_key",
      "update_key_budget",
      "revoke_virtual_key",
      "set_budget_policy",
    ]) {
      expect(byName.get(name)?.description).toContain("Requires explicit user confirmation");
    }
  });
});
