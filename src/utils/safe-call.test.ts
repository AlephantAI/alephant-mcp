import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.ALEPHANT_RATE_LIMIT_RPM = "0";
});

import { safeCall } from "./safe-call.js";

describe("safeCall", () => {
  beforeEach(() => {
    process.env.ALEPHANT_RATE_LIMIT_RPM = "0";
  });

  it("maps 401 for vk mode", async () => {
    const res = await safeCall(async () => {
      throw { status: 401, message: "nope" };
    }, "vk");
    expect(res.isError).toBe(true);
    expect(res.content[0]?.type).toBe("text");
    if (res.content[0]?.type === "text") {
      expect(res.content[0].text).toContain("ALEPHANT_VIRTUAL_KEY");
    }
  });

  it("maps 401 for manager mode", async () => {
    const res = await safeCall(async () => {
      throw { status: 401, message: "nope" };
    }, "manager");
    expect(res.isError).toBe(true);
    if (res.content[0]?.type === "text") {
      expect(res.content[0].text).toContain("ALEPHANT_PAT");
    }
  });

  it("maps 403 to fixed English sentence", async () => {
    const res = await safeCall(async () => {
      throw { status: 403, message: "nope" };
    }, "vk");
    expect(res.isError).toBe(true);
    if (res.content[0]?.type === "text") {
      expect(res.content[0].text).toBe(
        "Permission denied. This operation requires manager mode (PAT) or higher scope.",
      );
    }
  });

  it("returns JSON text on success", async () => {
    const res = await safeCall(async () => ({ ok: true }), "vk");
    expect(res.isError).toBeUndefined();
    if (res.content[0]?.type === "text") {
      expect(res.content[0].text).toContain('"ok": true');
    }
  });
});
