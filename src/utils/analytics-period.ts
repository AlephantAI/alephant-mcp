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

export type ComparisonPeriod = "7d" | "30d";

export function periodToTwoWindows(period: ComparisonPeriod): {
  current: { dateFrom: string; dateTo: string };
  previous: { dateFrom: string; dateTo: string };
} {
  const days = period === "7d" ? 7 : 30;
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const currentStart = new Date(todayUtc);
  currentStart.setUTCDate(currentStart.getUTCDate() - (days - 1));

  const previousEnd = new Date(currentStart);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);

  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (days - 1));

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    current: { dateFrom: fmt(currentStart), dateTo: fmt(todayUtc) },
    previous: { dateFrom: fmt(previousStart), dateTo: fmt(previousEnd) },
  };
}
