import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthMode } from "../auth/types.js";
import { registerPrompts } from "./register.js";

async function getPromptText(mode: AuthMode, name: string, args: Record<string, string> = {}) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerPrompts(server, mode);

  const client = new Client({ name: "c", version: "0.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = await client.getPrompt({ name, arguments: args });
    const first = result.messages[0]?.content;
    if (!first || first.type !== "text") throw new Error("Expected text prompt");
    return first.text;
  } finally {
    await client.close();
    await server.close();
  }
}

describe("registerPrompts", () => {
  it("uses composite analytics tools in manager cost audits", async () => {
    const text = await getPromptText("manager", "cost_audit_report", { period: "monthly" });
    expect(text).toContain("get_executive_dashboard");
    expect(text).toContain("diagnose_cost_anomaly");
  });

  it("uses cleanup and period comparison tools in manager optimization", async () => {
    const text = await getPromptText("manager", "cost_optimization", { focus: "general" });
    expect(text).toContain("find_idle_resources");
    expect(text).toContain("compare_entity_periods");
  });
});
