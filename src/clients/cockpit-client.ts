import axios, { type AxiosInstance } from "axios";
import { createHttpClient, type ClientAuth } from "./base-client.js";
import { requireBaseUrl } from "../config/env.js";

/**
 * Virtual Key mode: /api/v1/cockpit/* with Bearer VK only (no X-Workspace-Id).
 */
export class CockpitClient {
  readonly http: AxiosInstance;
  private readonly root: string;

  constructor(baseURL: string, virtualKey: string) {
    this.root = baseURL.replace(/\/$/, "");
    const auth: ClientAuth = { kind: "vk", token: virtualKey };
    this.http = createHttpClient(this.root, auth);
  }

  /** No Authorization header (public health). */
  async health(): Promise<unknown> {
    const { data } = await axios.get(`${this.root}/api/v1/cockpit/health`, {
      timeout: 15_000,
    });
    return data;
  }

  async scope(): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/cockpit/scope");
    return data;
  }

  async usageSummary(period: string): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/cockpit/usage-summary", {
      params: { period },
    });
    return data;
  }

  async dailyCosts(period: string): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/cockpit/daily-costs", {
      params: { period },
    });
    return data;
  }

  async costByModel(period: string): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/cockpit/cost-by-model", {
      params: { period },
    });
    return data;
  }

  async budgetStatus(period = "30d"): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/cockpit/budget-status", {
      params: { period },
    });
    return data;
  }

  async recentRequests(limit: number, offset = 0): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/cockpit/recent-requests", {
      params: { limit, offset },
    });
    return data;
  }
}

export function createCockpitClientFromEnv(virtualKey: string): CockpitClient {
  return new CockpitClient(requireBaseUrl(), virtualKey);
}
