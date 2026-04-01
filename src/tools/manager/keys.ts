import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolDeps } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

const budgetActionSchema = z
  .enum(["alert_only", "block"])
  .describe("alert_only = notify; block = block_requests on virtual key");

export function registerManagerKeyTools(server: McpServer, deps: ToolDeps): void {
  server.tool("list_virtual_keys", {}, async () => {
    if (!deps.manager) throw new Error("Manager client not configured");
    return safeCall(() => deps.manager!.listVirtualKeys(), "manager");
  });

  server.tool(
    "create_virtual_key",
    {
      label: z.string().min(1).max(100),
      master_key_id: z.string().uuid(),
      budget_cents: z.coerce.number().int().min(0),
      rate_limit_rpm: z.coerce.number().int().min(1).max(10_000),
    },
    async ({ label, master_key_id, budget_cents, rate_limit_rpm }) => {
      if (!deps.manager) throw new Error("Manager client not configured");
      const body = {
        label,
        masterKeyId: master_key_id,
        budget: budget_cents / 100,
        rateLimitRpm: rate_limit_rpm,
      };
      return safeCall(() => deps.manager!.createVirtualKey(body), "manager");
    },
  );

  server.tool(
    "update_key_budget",
    {
      key_id: z.string().uuid(),
      budget_cents: z.coerce.number().int().min(0),
      budget_action: budgetActionSchema,
    },
    async ({ key_id, budget_cents, budget_action }) => {
      if (!deps.manager) throw new Error("Manager client not configured");
      const budgetAction = budget_action === "alert_only" ? "alert_only" : "block_requests";
      const body = {
        budget: budget_cents / 100,
        budgetAction,
      };
      return safeCall(() => deps.manager!.patchVirtualKey(key_id, body), "manager");
    },
  );

  server.tool(
    "revoke_virtual_key",
    { key_id: z.string().uuid() },
    async ({ key_id }) => {
      if (!deps.manager) throw new Error("Manager client not configured");
      return safeCall(() => deps.manager!.revokeVirtualKey(key_id), "manager");
    },
  );
}
