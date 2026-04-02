import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolDeps } from "../deps.js";
import { safeCall, toHttpLike } from "../../utils/safe-call.js";
import type { BudgetControlConfig } from "../../clients/types.js";

const policyActionSchema = z.enum(["alert_only", "block"]);

export function registerManagerPolicyTools(server: McpServer, deps: ToolDeps): void {
  server.tool("get_subscription_info", {}, async () => {
    if (!deps.manager) throw new Error("Manager client not configured");
    return safeCall(() => deps.manager!.getSubscriptionCurrent(), "manager");
  });

  server.tool(
    "set_budget_policy",
    {
      budget_cents: z.coerce.number().int().min(0),
      action: policyActionSchema,
    },
    async ({ budget_cents, action }) => {
      if (!deps.manager) throw new Error("Manager client not configured");
      return safeCall(async () => {
        // Read-modify-write: fetch current config, merge, write back.
        // Not atomic — concurrent calls may overwrite each other.
        // Retry once on 409 Conflict to mitigate races.
        const exceededAction = action === "alert_only" ? "alert-only" : "pause";
        for (let attempt = 0; attempt < 2; attempt++) {
          const current = await deps.manager!.getBudgetControl();
          const cfg = { ...(current?.config ?? {}) } as Partial<BudgetControlConfig>;
          cfg.amount = budget_cents / 100;
          // API budget-control endpoint uses "pause" (not "block_requests") for enforcement
          cfg.exceededAction = exceededAction;
          if (!cfg.period) cfg.period = "monthly";
          if (!cfg.thresholds) cfg.thresholds = [50, 75, 90, 100];
          if (!cfg.currency) cfg.currency = "USD";
          try {
            return await deps.manager!.putBudgetControl({ config: cfg });
          } catch (err) {
            const e = toHttpLike(err);
            if (e.status === 409 && attempt === 0) {
              console.error("[set_budget_policy] 409 conflict, retrying");
              continue;
            }
            throw err;
          }
        }
        throw new Error("Budget policy update failed after retries");
      }, "manager");
    },
  );
}
