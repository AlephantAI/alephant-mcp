# Alephant MCP Marketplace Submission Guide

This guide tracks the distribution materials for `@alephantai/mcp` and the submission sequence for MCP directories.

## Package

- npm package: `@alephantai/mcp`
- CLI binary: `alephant-mcp`
- MCP registry name: `io.github.alephantai/alephant-mcp`
- Transport: local stdio
- Repository: `https://github.com/AlephantAI/alephant-mcp`
- Homepage: `https://alephant.io`
- License: `ISC`

## Required Files

| File | Purpose |
|------|---------|
| `package.json` | npm package metadata and `mcpName` for official MCP Registry validation |
| `server.json` | Official MCP Registry server metadata |
| `smithery.yaml` | Smithery build and runtime configuration |
| `README.md` | Human-readable install instructions for Cursor, Claude Desktop, Codex, OpenCode, and Claude Code |

## Official MCP Registry

Before publishing, confirm `package.json.mcpName` exactly matches `server.json.name`.

```bash
npx @modelcontextprotocol/registry init
mcp-publisher login github
mcp-publisher publish
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.alephantai/alephant-mcp"
```

If the registry publisher reports namespace permission issues, use GitHub Actions OIDC for the `io.github.alephantai/*` namespace or switch to a verified domain namespace after DNS verification.

## Smithery

Smithery reads `smithery.yaml` from the MCP server project root.

Submission checklist:

- Repository is public.
- `smithery.yaml` exists in the repository root or configured base directory.
- The configured command is `npx -y @alephantai/mcp`.
- The config form includes VK mode and Manager mode credentials.
- Sensitive credential fields are marked as sensitive.

## Glama

Glama can index a GitHub repository directly.

Submission checklist:

- Submit the public GitHub repository URL.
- Confirm Glama detects `@alephantai/mcp`.
- Confirm the generated Cursor and Claude config uses `npx -y @alephantai/mcp`.
- Confirm environment variables include `ALEPHANT_API_BASE_URL`, `ALEPHANT_VIRTUAL_KEY`, `ALEPHANT_PAT`, and `ALEPHANT_WORKSPACE_ID`.

Glama indexes tool names, descriptions, schemas, and safety annotations. For better discovery, all tools should eventually have explicit descriptions and read/write/destructive annotations.

## Recommended Submission Order

1. Publish the next npm patch version after metadata changes.
2. Publish `server.json` to the official MCP Registry.
3. Submit the GitHub repository to Glama.
4. Submit or connect the GitHub repository in Smithery.
5. Add links to each live directory entry from the README and product docs.

## Current Known Follow-ups

- Add descriptions for every MCP tool, not only write operations.
- Add MCP annotations for read-only, write, idempotent, and destructive operations.
- Add a remote MCP / Streamable HTTP entry if Alephant wants hosted connector distribution.
- Keep API base URL examples consistent across README, Fern docs, Smithery, and product UI.
