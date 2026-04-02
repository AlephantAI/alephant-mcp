import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolDeps } from "../deps.js";
import { requireManager } from "../deps.js";
import { safeCall } from "../../utils/safe-call.js";

const policyActionSchema = z.enum(["alert_only", "block"]);

export function registerManagerPolicyTools(server: McpServer, deps: ToolDeps): void {
  server.tool("get_subscription_info", {}, async () => {
    const manager = requireManager(deps);
    return safeCall(() => manager.getSubscriptionCurrent(), "manager");
  });

  server.tool(
    "set_budget_policy",
    {
      budget_cents: z.coerce.number().int().min(0),
      action: policyActionSchema,
    },
    async ({ budget_cents, action }) => {
      const manager = requireManager(deps);
      return safeCall(async () => {
        const current = (await manager.getBudgetControl()) as {
          data?: { config?: Record<string, unknown> };
        };
        const cfg = { ...(current?.data?.config ?? {}) } as Record<string, unknown>;
        cfg.amount = Math.round(budget_cents / 100 * 100) / 100;
        cfg.exceededAction = action === "alert_only" ? "alert-only" : "pause";
        if (!cfg.period) cfg.period = "monthly";
        if (!cfg.thresholds) cfg.thresholds = [50, 75, 90, 100];
        if (!cfg.currency) cfg.currency = "USD";
        return manager.putBudgetControl({ config: cfg });
      }, "manager");
    },
  );
}
