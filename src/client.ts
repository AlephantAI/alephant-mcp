/**
 * Alephant Cockpit API client: Virtual Key auth only, no login.
 * Uses the current request's Virtual Key as scope; calls /api/cockpit/*.
 */

import axios, { type AxiosInstance } from "axios";
import { getApiBaseUrl, getVirtualKey } from "./config.js";

export interface CockpitScope {
  workspace: { id: string; name: string };
  department?: { id: string; name: string };
  agent?: { id: string; name: string };
  member?: { id: string; name: string };
}

export interface AttributionItem {
  id: string;
  name: string;
  badge?: string;
  costUsd: number;
  highlight?: string;
}

export interface DashboardSnapshot {
  costHistoryPercent?: number[];
  runtimeEstDays?: number;
  burnRatePerHour?: number;
  attributionItems?: AttributionItem[];
}

export interface LiveMetrics {
  percent?: number;
  remainingPercent?: string;
  burnRate?: string;
  history?: number[];
}

export interface PolicyActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

function createClient(): AxiosInstance | null {
  const baseURL = getApiBaseUrl();
  const vkey = getVirtualKey();
  if (!baseURL || !vkey) return null;

  const url = baseURL.replace(/\/$/, "");
  return axios.create({
    baseURL: url,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${vkey}`,
      "X-Alephant-Virtual-Key": vkey,
    },
    timeout: 15000,
  });
}

export async function getScope(): Promise<CockpitScope | null> {
  const client = createClient();
  if (!client) return null;
  try {
    const { data } = await client.get<CockpitScope>("/api/cockpit/scope");
    return data;
  } catch {
    return null;
  }
}

export async function getDashboard(): Promise<DashboardSnapshot | null> {
  const client = createClient();
  if (!client) return null;
  try {
    const { data } = await client.get<DashboardSnapshot>("/api/cockpit/dashboard");
    return data;
  } catch {
    return null;
  }
}

export async function getLiveMetrics(): Promise<LiveMetrics | null> {
  const client = createClient();
  if (!client) return null;
  try {
    const { data } = await client.get<LiveMetrics>("/api/cockpit/live-metrics");
    return data;
  } catch {
    return null;
  }
}

export async function applyPolicy(action: "block" | "low-cost" | "restore"): Promise<PolicyActionResult | null> {
  const client = createClient();
  if (!client) return null;
  try {
    const { data } = await client.post<PolicyActionResult>("/api/cockpit/policy", { action });
    return data;
  } catch (err: unknown) {
    const e = err;
    if (axios.isAxiosError(e) && e.response?.data) {
      return e.response.data as PolicyActionResult;
    }
    return null;
  }
}

/** Format scope as display label, e.g. "Workspace: Main · Department: Engineering" */
export function formatScopeLabel(scope: CockpitScope): string {
  const parts: string[] = [`Workspace: ${scope.workspace?.name ?? scope.workspace?.id ?? "—"}`];
  if (scope.department) parts.push(`Department: ${scope.department.name}`);
  if (scope.agent) parts.push(`Agent: ${scope.agent.name}`);
  if (scope.member) parts.push(`Member: ${scope.member.name}`);
  return parts.join(" · ");
}
