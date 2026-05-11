export interface UsageSummaryResponse {
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRequests: number;
  period: string;
}

export interface DailyCostEntry {
  date: string;
  costCents: number;
  requests: number;
}

export interface ModelCostEntry {
  model: string;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

export interface ScopeResponse {
  workspaceId: string;
  workspaceName: string;
  keyId: string;
  keyLabel: string;
  departmentId?: string;
  agentId?: string;
}

export interface BudgetStatusResponse {
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
  percentUsed: number;
  exceededAction: string;
  period: string;
}

export interface WorkspaceOverviewResponse {
  totalMembers: number;
  totalAgents: number;
  totalVirtualKeys: number;
  totalDepartments: number;
  totalCostCents: number;
}

export interface VirtualKeyResponse {
  id: string;
  label: string;
  masterKeyId: string;
  budgetCents: number;
  spentCents: number;
  rateLimitRpm: number;
  status: "active" | "revoked" | "exceeded";
  createdAt: string;
}

export interface VirtualKeysListResponse {
  keys: VirtualKeyResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AgentResponse {
  id: string;
  name: string;
  departmentId?: string;
  status: string;
  createdAt: string;
}

export interface AgentsListResponse {
  agents: AgentResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DepartmentResponse {
  id: string;
  name: string;
  memberCount: number;
  agentCount: number;
}

export interface DepartmentsListResponse {
  departments: DepartmentResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MemberResponse {
  id: string;
  name?: string;
  email?: string;
  departmentId?: string;
  role?: string;
  status?: string;
  createdAt?: string;
}

export interface MembersListResponse {
  members: MemberResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SubscriptionResponse {
  plan: string;
  status: string;
  billingCycleStart: string;
  billingCycleEnd: string;
  quotaCents: number;
  usedCents: number;
}

export interface BudgetControlConfig {
  amount: number;
  exceededAction: string;
  period: string;
  thresholds: number[];
  currency: string;
}

export interface BudgetControlResponse {
  config: BudgetControlConfig;
}

export interface CreateVirtualKeyBody {
  label: string;
  masterKeyId: string;
  budget: number;
  rateLimitRpm: number;
}

export interface UpdateKeyBudgetBody {
  budget: number;
  budgetAction: string;
}
