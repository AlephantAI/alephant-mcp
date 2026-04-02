import type { AxiosInstance } from "axios";
import { createHttpClient, type ClientAuth } from "./base-client.js";
import { requireBaseUrl } from "../config/env.js";
import type { SharedPeriod } from "../utils/analytics-period.js";
import { periodToDateRange } from "../utils/analytics-period.js";
import type { AgentDeptPeriod } from "../utils/analytics-period.js";
import { agentPeriodToDays } from "../utils/analytics-period.js";

/**
 * Manager (PAT) mode: /api/v1/* with Bearer PAT + X-Workspace-Id.
 */
export class ManagerClient {
  readonly http: AxiosInstance;
  private readonly workspaceId: string;

  constructor(baseURL: string, pat: string, workspaceId: string) {
    this.workspaceId = workspaceId;
    const auth: ClientAuth = { kind: "pat", token: pat, workspaceId };
    this.http = createHttpClient(baseURL.replace(/\/$/, ""), auth);
  }

  async getWorkspaceOverview(): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/analytics/overview");
    return data;
  }

  async getAnalyticsCosts(period: SharedPeriod): Promise<unknown> {
    const q = periodToDateRange(period);
    const { data } = await this.http.get("/api/v1/analytics/costs", { params: q });
    return data;
  }

  async getAnalyticsUsage(period: SharedPeriod): Promise<unknown> {
    const q = periodToDateRange(period);
    const { data } = await this.http.get("/api/v1/analytics/usage", { params: q });
    return data;
  }

  async getAnalyticsModels(period: SharedPeriod): Promise<unknown> {
    const q = periodToDateRange(period);
    const { data } = await this.http.get("/api/v1/analytics/models", { params: q });
    return data;
  }

  async listVirtualKeys(page = 1, pageSize = 50): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/virtual-keys", {
      params: { page, pageSize },
    });
    return data;
  }

  async createVirtualKey(body: Record<string, unknown>): Promise<unknown> {
    const { data } = await this.http.post("/api/v1/virtual-keys", body);
    return data;
  }

  async patchVirtualKey(id: string, body: Record<string, unknown>): Promise<unknown> {
    const { data } = await this.http.patch(`/api/v1/virtual-keys/${id}`, body);
    return data;
  }

  async revokeVirtualKey(id: string): Promise<unknown> {
    const { data } = await this.http.post(`/api/v1/virtual-keys/${id}/revoke`);
    return data;
  }

  async listAgents(departmentId?: string, page = 1, pageSize = 50): Promise<unknown> {
    const params: Record<string, string | number> = { page, pageSize };
    if (departmentId) params.departmentId = departmentId;
    const { data } = await this.http.get("/api/v1/agents", { params });
    return data;
  }

  async getAgentAnalytics(agentId: string, period: AgentDeptPeriod): Promise<unknown> {
    const days = agentPeriodToDays(period);
    const { data } = await this.http.get(`/api/v1/agents/${agentId}/analytics`, {
      params: { days },
    });
    return data;
  }

  async listDepartments(page = 1, pageSize = 100): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/departments", {
      params: { page, pageSize },
    });
    return data;
  }

  async getDepartmentAnalytics(departmentId: string, period: AgentDeptPeriod): Promise<unknown> {
    const days = agentPeriodToDays(period);
    const { data } = await this.http.get(`/api/v1/departments/${departmentId}/analytics`, {
      params: { days },
    });
    return data;
  }

  async getSubscriptionCurrent(): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/subscriptions/current");
    return data;
  }

  async getBudgetControl(): Promise<unknown> {
    const { data } = await this.http.get("/api/v1/policies/budget-control");
    return data;
  }

  async putBudgetControl(body: Record<string, unknown>): Promise<unknown> {
    const { data } = await this.http.put("/api/v1/policies/budget-control", body);
    return data;
  }

  getWorkspaceId(): string {
    return this.workspaceId;
  }
}

export function createManagerClientFromEnv(pat: string, workspaceId: string): ManagerClient {
  return new ManagerClient(requireBaseUrl(), pat, workspaceId);
}
