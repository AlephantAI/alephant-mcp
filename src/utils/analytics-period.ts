export type SharedPeriod = "24h" | "7d" | "30d" | "billing_cycle";
export type AgentDeptPeriod = "24h" | "7d" | "30d";

/** Maps MCP period to SaaS analytics dateFrom/dateTo (omit both for billing cycle). */
export function periodToDateRange(period: SharedPeriod): { dateFrom?: string; dateTo?: string } {
  if (period === "billing_cycle") return {};
  const end = new Date();
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const days = period === "24h" ? 1 : period === "7d" ? 7 : 30;
  const start = new Date(endUtc);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: fmt(start), dateTo: fmt(endUtc) };
}

export function agentPeriodToDays(period: AgentDeptPeriod): number {
  if (period === "24h") return 1;
  if (period === "7d") return 7;
  return 30;
}
