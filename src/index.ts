#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { detectAuthMode } from "./auth/detector.js";
import {
  getPat,
  getVirtualKey,
  getWorkspaceId,
  requireBaseUrl,
} from "./config/env.js";
import { createCockpitClientFromEnv } from "./clients/cockpit-client.js";
import { createManagerClientFromEnv } from "./clients/manager-client.js";
import { registerTools } from "./tools/registry.js";
import type { ToolDeps } from "./tools/deps.js";
import { registerPrompts } from "./prompts/register.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPackageVersion(): string {
  try {
    const raw = readFileSync(path.join(__dirname, "..", "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function runAudit(mode: ReturnType<typeof detectAuthMode>): Promise<void> {
  if (mode === "vk") {
    const vk = getVirtualKey();
    if (!vk) throw new Error("ALEPHANT_VIRTUAL_KEY missing");
    const cockpit = createCockpitClientFromEnv(vk);
    const scope = await cockpit.scope();
    const usage = await cockpit.usageSummary("billing_cycle");
    console.log("[Alephant audit — VK]", JSON.stringify({ scope, usage }));
    return;
  }

  const pat = getPat();
  const ws = getWorkspaceId();
  if (!pat || !ws) {
    throw new Error("ALEPHANT_PAT and ALEPHANT_WORKSPACE_ID required for manager audit");
  }
  const manager = createManagerClientFromEnv(pat, ws);
  const overview = await manager.getWorkspaceOverview();
  console.log("[Alephant audit — manager] workspace:", ws, JSON.stringify(overview));
}

async function main(): Promise<void> {
  const mode = detectAuthMode(process.env);
  requireBaseUrl();
  const version = readPackageVersion();

  if (process.argv.includes("--audit")) {
    await runAudit(mode);
    return;
  }

  const server = new McpServer({
    name: "alephant",
    version,
  });

  let deps: ToolDeps;
  if (mode === "vk") {
    const vk = getVirtualKey();
    if (!vk) {
      throw new Error("ALEPHANT_VIRTUAL_KEY missing");
    }
    const cockpit = createCockpitClientFromEnv(vk);
    deps = {
      mode,
      cockpit,
      manager: null,
    };
  } else {
    const pat = getPat();
    const workspaceId = getWorkspaceId();
    if (!pat || !workspaceId) {
      throw new Error("ALEPHANT_PAT and ALEPHANT_WORKSPACE_ID required");
    }
    const manager = createManagerClientFromEnv(pat, workspaceId);
    deps = {
      mode,
      cockpit: null,
      manager,
    };
  }

  registerTools(server, mode, deps);
  registerPrompts(server, mode);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  const cred =
    mode === "vk"
      ? "VK mode (ALEPHANT_VIRTUAL_KEY)"
      : `manager/PAT mode (workspace ${getWorkspaceId()})`;
  console.error(`Alephant MCP v${version} — ${cred}; base URL ${requireBaseUrl()}`);

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      console.error(`Alephant MCP received ${signal}, shutting down`);
      process.exit(0);
    });
  }
}

try {
  await main();
} catch (err) {
  console.error("Startup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
