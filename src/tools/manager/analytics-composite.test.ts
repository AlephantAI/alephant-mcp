import { describe, it, expect, vi, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.hoisted(() => {
  process.env.ALEPHANT_RATE_LIMIT_RPM = "0";
});

import type { ManagerClient } from "../../clients/manager-client.js";
import type { ToolDeps } from "../deps.js";
import {
  buildAnomalyResult,
  buildDashboardResult,
  buildCompareResult,
  registerManagerCompositeTools,
} from "./analytics-composite.js";
import { resetGlobalRateLimiter } from "../../utils/rate-limiter.js";

function parseToolJson(res: unknown): unknown {
  const r = res as { content?: Array<{ type: string; text?: string }> };
  const block = r.content?.find((c) => c.type === "text");
  if (block && "text" in block && block.text) return JSON.parse(block.text);
  throw new Error("Expected text content");
}

async function callCompositeTool(
  mockManager: Partial<ManagerClient>,
  name: string,
  args: Record<string, unknown>,
) {
  resetGlobalRateLimiter();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  const deps: ToolDeps = {
    mode: "manager",
    cockpit: null,
    manager: mockManager as ManagerClient,
  };
  registerManagerCompositeTools(server, deps);
  const client = new Client({ name: "c", version: "0.0.0" });
  // Server must attach handlers before client initialize handshake.
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await client.callTool({ name, arguments: args });
  } finally {
    await client.close();
    await server.close();
    resetGlobalRateLimiter();
  }
}

afterEach(() => {
  resetGlobalRateLimiter();
});

describe("buildAnomalyResult", () => {
  it("computes changePercent correctly", () => {
    const currentBreakdown = [
      { dimension: "agent", id: "a1", name: "Agent-1", cost: 150 },
      { dimension: "agent", id: "a2", name: "Agent-2", cost: 50 },
    ];
    const previousBreakdown = [
      { dimension: "agent", id: "a1", name: "Agent-1", cost: 100 },
      { dimension: "agent", id: "a2", name: "Agent-2", cost: 100 },
    ];
    const result = buildAnomalyResult(currentBreakdown, previousBreakdown, null);
    expect(result.totalCostChange.current).toBe(200);
    expect(result.totalCostChange.previous).toBe(200);
    expect(result.totalCostChange.changePercent).toBe(0);
    expect(result.anomalies.length).toBe(2);
    const a1 = result.anomalies.find((a: { entityId: string }) => a.entityId === "a1");
    expect(a1?.changePercent).toBe(50);
    expect(a1?.severity).toBe("high");
  });

  it("tags severity correctly", () => {
    const current = [{ dimension: "department", id: "d1", name: "Dept", cost: 130 }];
    const previous = [{ dimension: "department", id: "d1", name: "Dept", cost: 100 }];
    const result = buildAnomalyResult(current, previous, null);
    expect(result.anomalies[0].severity).toBe("medium");
  });

  it("handles missing previous entity as 100% increase", () => {
    const current = [{ dimension: "agent", id: "new", name: "New", cost: 50 }];
    const previous: typeof current = [];
    const result = buildAnomalyResult(current, previous, null);
    expect(result.anomalies[0].changePercent).toBe(100);
    expect(result.anomalies[0].severity).toBe("high");
  });
});

describe("buildDashboardResult", () => {
  it("tags sparkline trends correctly", () => {
    const sparklineData = {
      spend: [10, 12, 15, 18, 20, 22, 25],
      requests: [100, 100, 100, 100, 100, 100, 100],
      tokens: [500, 480, 460, 440, 420, 400, 380],
    };
    const result = buildDashboardResult(null, sparklineData, null);
    expect(result.sparklines.spend.trend).toBe("up");
    expect(result.sparklines.requests.trend).toBe("flat");
    expect(result.sparklines.tokens.trend).toBe("down");
  });

  it("handles null sparkline data gracefully", () => {
    const result = buildDashboardResult(null, null, null);
    expect(result._meta.partial).toBe(true);
    expect(result._meta.failedSteps).toContain("sparklines");
  });
});

describe("buildCompareResult", () => {
  it("computes changes as percentage", () => {
    const current = { cost: 200, requests: 100, tokens: 5000 };
    const previous = { cost: 100, requests: 80, tokens: 4000 };
    const result = buildCompareResult("agent", "id-1", current, previous);
    expect(result.changes.costChange).toBe(100);
    expect(result.changes.requestChange).toBe(25);
    expect(result.changes.tokenChange).toBe(25);
  });

  it("handles zero previous gracefully", () => {
    const current = { cost: 50, requests: 10, tokens: 500 };
    const previous = { cost: 0, requests: 0, tokens: 0 };
    const result = buildCompareResult("department", "d-1", current, previous);
    expect(result.changes.costChange).toBe(100);
  });
});

const SAMPLE_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("drill_down_spend (integration)", () => {
  it("returns topLevel with limit applied", async () => {
    const mockManager: Partial<ManagerClient> = {
      getAnalyticsCosts: vi.fn().mockResolvedValue({
        data: {
          items: [
            { name: "A", id: "1", cost: 80, requests: 10 },
            { name: "B", id: "2", cost: 20, requests: 5 },
            { name: "C", id: "3", cost: 10, requests: 2 },
          ],
        },
      }),
    };
    const res = await callCompositeTool(mockManager, "drill_down_spend", {
      dimension: "department",
      period: "30d",
      limit: 2,
    });
    const body = parseToolJson(res) as { topLevel: Array<{ id: string; cost: number }> };
    expect(body.topLevel).toHaveLength(2);
    expect(body.topLevel[0].id).toBe("1");
    expect(body.topLevel[0].cost).toBe(80);
  });
});

describe("find_idle_resources (integration)", () => {
  it("returns partial=true when keys API fails", async () => {
    const mockManager: Partial<ManagerClient> = {
      listVirtualKeys: vi.fn().mockRejectedValue(new Error("timeout")),
    };
    const res = await callCompositeTool(mockManager, "find_idle_resources", {
      period: "30d",
      include: "keys",
    });
    const body = parseToolJson(res) as { _meta: { partial: boolean; failedSteps: string[] } };
    expect(body._meta.partial).toBe(true);
    expect(body._meta.failedSteps).toContain("step_0");
  });

  it("marks agents with zero requests as idle", async () => {
    const mockManager: Partial<ManagerClient> = {
      listAgents: vi.fn().mockResolvedValue({
        data: {
          data: [
            { id: "ag-1", name: "Agent1" },
            { id: "ag-2", name: "Agent2" },
          ],
          total: 2,
        },
      }),
      getAnalyticsCosts: vi.fn().mockResolvedValue({
        data: {
          breakdown: [
            {
              dimension: "agent",
              items: [
                { id: "ag-1", cost: 0, requests: 0 },
              ],
            },
          ],
        },
      }),
    };
    const res = await callCompositeTool(mockManager, "find_idle_resources", {
      period: "30d",
      include: "agents",
    });
    const body = parseToolJson(res) as {
      idleAgents: Array<{ id: string }>;
      summary: { totalAgents: number; idleAgentsCount: number };
    };
    expect(body.summary.totalAgents).toBe(2);
    expect(body.summary.idleAgentsCount).toBe(2);
    expect(body.idleAgents.map((a) => a.id).sort()).toEqual(["ag-1", "ag-2"]);
  });
});

describe("compare_entity_periods (integration)", () => {
  it("returns partial=true when previous window call fails", async () => {
    const mockManager: Partial<ManagerClient> = {
      getSaasUsageForEntity: vi
        .fn()
        .mockResolvedValueOnce({ data: { series: [{ cost: 10, requests: 5, tokens: 100 }] } })
        .mockRejectedValueOnce(new Error("timeout")),
    };
    const res = await callCompositeTool(mockManager, "compare_entity_periods", {
      entity_type: "agent",
      entity_id: SAMPLE_UUID,
      period: "30d",
    });
    const body = parseToolJson(res) as {
      _meta: { partial: boolean; failedSteps: string[] };
      previous: { cost: number; requests: number; tokens: number };
    };
    expect(body._meta.partial).toBe(true);
    expect(body._meta.failedSteps).toContain("previousWindow");
    expect(body.previous.cost).toBe(0);
    expect(body.previous.requests).toBe(0);
    expect(body.previous.tokens).toBe(0);
  });
});
