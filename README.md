# Alephant MCP Server

Model Context Protocol server for **Alephant BYO-KEY**: FinOps metrics, virtual keys, and workspace analytics from Cursor, Claude Desktop, or any MCP host.

## Modes

| Mode | Environment | Tools |
|------|-------------|--------|
| **VK** | `ALEPHANT_VIRTUAL_KEY` | Cockpit-scoped usage + 3 VK tools (8 tools total incl. shared) |
| **Manager** | `ALEPHANT_PAT` + `ALEPHANT_WORKSPACE_ID` | Workspace-wide management (27 tools total incl. shared) |

PAT takes precedence when `ALEPHANT_PAT` is non-empty. If neither VK nor PAT is set, the process exits with an error (no mock data).

**Required (both modes):** `ALEPHANT_API_BASE_URL`  
**Optional:** `ALEPHANT_RATE_LIMIT_RPM` (default `60`, use `0` to disable client-side throttling)

### Windows / `npx` troubleshooting

**From this repo’s root (`alephant-mcp/`):** do **not** use `npx -y @alephantai/mcp` to “smoke test” the published package. npm treats the current directory as the local `@alephantai/mcp` project and does **not** link the root package’s `bin` into `node_modules/.bin`, so Windows then fails with `'alephant-mcp' is not recognized` (or the Chinese CMD equivalent).

Use one of these instead while developing in the clone:

```powershell
npm start
# or
node .\bin\alephant-mcp.js
```

To verify `npx` the same way end users do, run it from **any other directory** (e.g. the parent folder):

```powershell
cd ..
npx -y @alephantai/mcp
```

**From a normal project folder** (after `npm install @alephantai/mcp`), you can also run:

```powershell
node .\node_modules\@alephantai\mcp\bin\alephant-mcp.js
```

If `npx -y @alephantai/mcp` still fails outside the clone, try:

```powershell
npx --yes --package=@alephantai/mcp alephant-mcp
```

Published packages **0.0.2+** include the `bin/alephant-mcp.js` shim for reliable npm bin resolution when installed from the registry.

## MCP client config

Alephant MCP is a local stdio server. Use one server entry per credential scope. For multiple workspaces, create multiple entries with different names and environment variables.

### Cursor / Claude Desktop

**Virtual Key (read-only / scoped cockpit):**

```json
{
  "mcpServers": {
    "alephant": {
      "command": "npx",
      "args": ["-y", "@alephantai/mcp"],
      "env": {
        "ALEPHANT_API_BASE_URL": "https://api.alephant.ai",
        "ALEPHANT_VIRTUAL_KEY": "vk-..."
      }
    }
  }
}
```

**Personal Access Token (manager):**

```json
{
  "mcpServers": {
    "alephant-workspace-a": {
      "command": "npx",
      "args": ["-y", "@alephantai/mcp"],
      "env": {
        "ALEPHANT_API_BASE_URL": "https://api.alephant.ai",
        "ALEPHANT_PAT": "pat_...",
        "ALEPHANT_WORKSPACE_ID": "00000000-0000-0000-0000-000000000000"
      }
    }
  }
}
```

Use **separate `mcpServers` entries** per workspace when you have multiple PATs.

### Codex

Add a stdio MCP server in `~/.codex/config.toml`:

```toml
[mcp_servers.alephant]
command = "npx"
args = ["-y", "@alephantai/mcp"]
env = {
  ALEPHANT_API_BASE_URL = "https://api.alephant.ai",
  ALEPHANT_VIRTUAL_KEY = "vk-..."
}
startup_timeout_sec = 20
tool_timeout_sec = 120
```

For Manager mode, replace the VK env with:

```toml
env = {
  ALEPHANT_API_BASE_URL = "https://api.alephant.ai",
  ALEPHANT_PAT = "pat_...",
  ALEPHANT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000000"
}
```

Verify with:

```bash
codex mcp list
codex mcp get alephant
```

### OpenCode

Add a local MCP server under `mcp` in your OpenCode config, for example `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "alephant": {
      "type": "local",
      "command": ["npx", "-y", "@alephantai/mcp"],
      "enabled": true,
      "environment": {
        "ALEPHANT_API_BASE_URL": "https://api.alephant.ai",
        "ALEPHANT_VIRTUAL_KEY": "vk-..."
      }
    }
  }
}
```

For Manager mode, use `ALEPHANT_PAT` and `ALEPHANT_WORKSPACE_ID` in `environment` instead of `ALEPHANT_VIRTUAL_KEY`.

### Claude Code

Use the CLI to add Alephant as a local stdio server:

```bash
claude mcp add-json alephant '{"type":"stdio","command":"npx","args":["-y","@alephantai/mcp"],"env":{"ALEPHANT_API_BASE_URL":"https://api.alephant.ai","ALEPHANT_VIRTUAL_KEY":"vk-..."}}' --scope user
claude mcp list
claude mcp get alephant
```

For a shared project config, create `.mcp.json` in the project root:

```json
{
  "mcpServers": {
    "alephant": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@alephantai/mcp"],
      "env": {
        "ALEPHANT_API_BASE_URL": "https://api.alephant.ai",
        "ALEPHANT_VIRTUAL_KEY": "vk-..."
      }
    }
  }
}
```

For Manager mode, replace the VK env with `ALEPHANT_PAT` and `ALEPHANT_WORKSPACE_ID`.

## CLI audit

```bash
npx --yes --package=@alephantai/mcp alephant-mcp --audit
```

- **VK:** prints cockpit `scope` + `usage-summary` (billing cycle).  
- **Manager:** prints workspace id + `GET /api/v1/analytics/overview`.

## Tools (summary)

Shared (both modes): `check_alephant_connection`, `get_usage_summary`, `get_daily_costs`, `get_cost_by_model`, `list_available_models`  
VK only: `get_my_scope`, `get_my_budget`, `get_my_recent_requests`  
Manager only: `get_workspace_overview`, `get_workspace_budget_status`, `list_virtual_keys`, `create_virtual_key`, `update_key_budget`, `revoke_virtual_key`, `list_agents`, `get_agent_analytics`, `list_members`, `get_member_analytics`, `list_departments`, `get_department_analytics`, `get_subscription_info`, `set_budget_policy`, `get_live_24h`, `get_usage_timeseries`, `get_sparklines`, `diagnose_cost_anomaly`, `get_executive_dashboard`, `drill_down_spend`, `find_idle_resources`, `compare_entity_periods`

`get_request_logs` is **not** included (JWT-only backend route).

## Prompts & resources

- **cost_audit_report** — both modes  
- **cost_optimization** — manager only

## Documentation

- **[中文：在 AI Agent 中如何使用 MCP](docs/zh-CN/agent-mcp-usage.md)** — 自然语言提问示例、`/alephant-…` 快捷模板、工具对照表  
- **Marketplace submission**: see [`docs/marketplace-submission.md`](docs/marketplace-submission.md) for official MCP Registry, Smithery, and Glama submission notes.

## Development

```bash
npm install
npm test
npm run build
```

## Package

Published as **`@alephantai/mcp`** (`alephant-mcp` binary).
