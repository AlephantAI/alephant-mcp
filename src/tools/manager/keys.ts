import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolDeps } from "../deps.js";
import { requireManager } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

const budgetActionSchema = z
  .enum(["alert_only", "block"])
  .describe("alert_only = notify; block = block_requests on virtual key");

/** Tool parameter budget_cents is in cents; API body budget field is in dollars. */
const CENTS_TO_DOLLARS = 100;

export function registerManagerKeyTools(server: McpServer, deps: ToolDeps): void {
  server.tool("list_virtual_keys", {}, async () => {
    const manager = requireManager(deps);
    return safeCall(() => manager.listVirtualKeys(), "manager");
  });

  server.tool(
    "create_virtual_key",
    "Creates a virtual key in the current workspace. Requires explicit user confirmation before calling.",
    {
      label: z.string().min(1).max(100).describe("Human-readable key label"),
      master_key_id: z.string().uuid().describe("Parent master key UUID"),
      budget_cents: z.coerce.number().int().min(0).describe("Budget in cents (÷100 = dollars)"),
      rate_limit_rpm: z.coerce.number().int().min(1).max(10_000).describe("Requests per minute limit"),
    },
    async ({ label, master_key_id, budget_cents, rate_limit_rpm }) => {
      const manager = requireManager(deps);
      const body = {
        label,
        masterKeyId: master_key_id,
        budget: Math.round(budget_cents / CENTS_TO_DOLLARS * 100) / 100,
        rateLimitRpm: rate_limit_rpm,
      };
      return safeCall(() => manager.createVirtualKey(body), "manager");
    },
  );

  server.tool(
    "update_key_budget",
    "Updates the budget and enforcement action for an existing virtual key. Requires explicit user confirmation before calling.",
    {
      key_id: z.string().uuid(),
      budget_cents: z.coerce.number().int().min(0).describe("Budget in cents (÷100 = dollars)"),
      budget_action: budgetActionSchema,
    },
    async ({ key_id, budget_cents, budget_action }) => {
      const manager = requireManager(deps);
      // API expects "block_requests" for virtual key budget enforcement
      const budgetAction = budget_action === "alert_only" ? "alert-only" : "block";
      const body = {
        budget: Math.round(budget_cents / CENTS_TO_DOLLARS * 100) / 100,
        budgetAction,
      };
      return safeCall(() => manager.patchVirtualKey(key_id, body), "manager");
    },
  );

  server.tool(
    "revoke_virtual_key",
    "Revokes an existing virtual key. Requires explicit user confirmation before calling.",
    { key_id: z.string().uuid() },
    async ({ key_id }) => {
      const manager = requireManager(deps);
      return safeCall(() => manager.revokeVirtualKey(key_id), "manager");
    },
  );
}
