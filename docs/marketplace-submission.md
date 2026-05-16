# Alephant MCP Marketplace Submission Guide

This guide tracks the distribution materials for `@alephantai/mcp` and the submission sequence for MCP directories.

## Package

- npm package: `@alephantai/mcp`
- CLI binary: `alephant-mcp`
- MCP registry name: `io.github.AlephantAI/alephant-mcp`
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
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.AlephantAI/alephant-mcp"
```

If the registry publisher reports namespace permission issues, use GitHub Actions OIDC for the `io.github.AlephantAI/*` namespace or switch to a verified domain namespace after DNS verification.

### GitHub Actions release workflow

This repository includes `.github/workflows/publish.yml` for one-click or tag-based releases.

Required repository secret:

- `NPM_TOKEN` — npm publish token with access to `@alephantai/mcp`.

MCP Registry publishing uses GitHub Actions OIDC and does not need a Registry secret.

Release options:

```bash
# Option A: push a version tag and let GitHub Actions run automatically
git tag v0.1.2
git push origin v0.1.2
```

Or open GitHub Actions, choose **Publish MCP package and registry metadata**, and click **Run workflow**.

The workflow validates package/server metadata, ensures the npm version is not already published, runs tests, builds, publishes to npm, then publishes `server.json` to the official MCP Registry.

## Smithery

Smithery now supports two publishing paths:

- **URL**: publish a public HTTPS Streamable HTTP MCP endpoint. If authentication is required, expose OAuth-compatible discovery.
- **Local stdio**: publish a pre-built MCPB bundle that clients download and run locally.

This package is currently a local stdio server distributed through npm. The next Smithery-ready step is to create an MCPB bundle, or add a hosted Streamable HTTP endpoint.

Submission checklist:

- Repository is public.
- `smithery.yaml` exists in the repository root or configured base directory.
- The configured command is `npx -y @alephantai/mcp`.
- The config form includes VK mode and Manager mode credentials.
- Sensitive credential fields are marked as sensitive.
- For current Smithery publishing, provide either `server.mcpb` or a public Streamable HTTP URL.

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

- Build and publish an MCPB bundle, or add a remote Streamable HTTP endpoint, for current Smithery distribution.
- Add a remote MCP / Streamable HTTP entry if Alephant wants hosted connector distribution.
- Keep API base URL examples consistent across README, Fern docs, Smithery, and product UI.
