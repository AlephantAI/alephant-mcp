import axios, { type AxiosInstance } from "axios";
import { createHttpClient, type ClientAuth } from "./base-client.js";
import { requireBaseUrl } from "../config/env.js";
import type {
  UsageSummaryResponse,
  DailyCostEntry,
  ModelCostEntry,
  ScopeResponse,
  BudgetStatusResponse,
} from "./types.js";

/**
 * Virtual Key mode: /api/v1/cockpit/* with Bearer VK only (no X-Workspace-Id).
 */
export class CockpitClient {
  readonly http: AxiosInstance;
  private readonly root: string;

  constructor(baseURL: string, virtualKey: string) {
    this.root = baseURL.replace(/\/$/, "");
    const auth: ClientAuth = { kind: "vk", token: virtualKey };
    this.http = createHttpClient(baseURL, auth);
  }

  /** No Authorization header (public health). */
  async health(): Promise<Record<string, unknown>> {
    const { data } = await axios.get(`${this.root}/api/v1/cockpit/health`, {
      timeout: 15_000,
    });
    return data as Record<string, unknown>;
  }

  async scope(): Promise<ScopeResponse> {
    const { data } = await this.http.get("/api/v1/cockpit/scope");
    return data as ScopeResponse;
  }

  async usageSummary(period: string): Promise<UsageSummaryResponse> {
    const { data } = await this.http.get("/api/v1/cockpit/usage-summary", {
      params: { period },
    });
    return data as UsageSummaryResponse;
  }

  async dailyCosts(period: string): Promise<DailyCostEntry[]> {
    const { data } = await this.http.get("/api/v1/cockpit/daily-costs", {
      params: { period },
    });
    return data as DailyCostEntry[];
  }

  async costByModel(period: string): Promise<ModelCostEntry[]> {
    const { data } = await this.http.get("/api/v1/cockpit/cost-by-model", {
      params: { period },
    });
    return data as ModelCostEntry[];
  }

  async budgetStatus(period = "30d"): Promise<BudgetStatusResponse> {
    const { data } = await this.http.get("/api/v1/cockpit/budget-status", {
      params: { period },
    });
    return data as BudgetStatusResponse;
  }

  async recentRequests(limit: number, offset = 0): Promise<unknown[]> {
    const { data } = await this.http.get("/api/v1/cockpit/recent-requests", {
      params: { limit, offset },
    });
    return data as unknown[];
  }

  async listModels(): Promise<unknown[]> {
    const { data } = await this.http.get("/api/v1/models");
    return data as unknown[];
  }
}

export function createCockpitClientFromEnv(virtualKey: string): CockpitClient {
  return new CockpitClient(requireBaseUrl(), virtualKey);
}
