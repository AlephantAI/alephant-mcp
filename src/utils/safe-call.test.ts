import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.ALEPHANT_RATE_LIMIT_RPM = "0";
});

import { safeCall, compositeToolAbortOnHttpError, compositeToolAbortFromError } from "./safe-call.js";
import { resetGlobalRateLimiter } from "./rate-limiter.js";

describe("safeCall", () => {
  beforeEach(() => {
    process.env.ALEPHANT_RATE_LIMIT_RPM = "0";
    resetGlobalRateLimiter();
  });

  afterEach(() => {
    resetGlobalRateLimiter();
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

  it("maps 403 to fixed english sentence", async () => {
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

  it("maps 429 with retry-after header", async () => {
    const res = await safeCall(async () => {
      throw { status: 429, message: "rate limited", headers: { "retry-after": "30" } };
    }, "vk");
    expect(res.isError).toBe(true);
    if (res.content[0]?.type === "text") {
      expect(res.content[0].text).toContain("Rate limit exceeded");
      expect(res.content[0].text).toContain("30");
    }
  });

  it("maps 504 gateway timeout", async () => {
    const res = await safeCall(async () => {
      throw { status: 504, message: "gateway timeout" };
    }, "vk");
    expect(res.isError).toBe(true);
    if (res.content[0]?.type === "text") {
      expect(res.content[0].text).toContain("Gateway timeout");
    }
  });

  it("maps 500 internal server error", async () => {
    const res = await safeCall(async () => {
      throw { status: 500, message: "internal error" };
    }, "vk");
    expect(res.isError).toBe(true);
    if (res.content[0]?.type === "text") {
      expect(res.content[0].text).toContain("Internal server error");
    }
  });

  it("maps ETIMEDOUT code", async () => {
    const res = await safeCall(async () => {
      throw { code: "ETIMEDOUT", message: "timeout" };
    }, "vk");
    expect(res.isError).toBe(true);
    if (res.content[0]?.type === "text") {
      expect(res.content[0].text).toContain("Request timeout");
    }
  });

  it("maps ECONNABORTED code", async () => {
    const res = await safeCall(async () => {
      throw { code: "ECONNABORTED", message: "aborted" };
    }, "vk");
    expect(res.isError).toBe(true);
    if (res.content[0]?.type === "text") {
      expect(res.content[0].text).toContain("Request timeout");
    }
  });

  it("maps generic error", async () => {
    const res = await safeCall(async () => {
      throw new Error("something went wrong");
    }, "vk");
    expect(res.isError).toBe(true);
    if (res.content[0]?.type === "text") {
      expect(res.content[0].text).toContain("Unexpected error");
      expect(res.content[0].text).toContain("something went wrong");
    }
  });
});

describe("compositeToolAbortOnHttpError", () => {
  it("returns null when no rejections", () => {
    expect(compositeToolAbortOnHttpError([{ status: "fulfilled", value: 1 }], "manager")).toBeNull();
  });

  it("returns null for generic rejection", () => {
    expect(
      compositeToolAbortOnHttpError([{ status: "rejected", reason: new Error("timeout") }], "manager"),
    ).toBeNull();
  });

  it("returns 401 result for manager mode", () => {
    const res = compositeToolAbortOnHttpError(
      [{ status: "rejected", reason: { status: 401, message: "nope" } }],
      "manager",
    );
    expect(res?.isError).toBe(true);
    expect(res?.content[0]).toMatchObject({ type: "text" });
    if (res?.content[0]?.type === "text") {
      expect(res.content[0].text).toContain("ALEPHANT_PAT");
    }
  });

  it("returns 429 with retry-after", () => {
    const res = compositeToolAbortOnHttpError(
      [
        { status: "fulfilled", value: {} },
        { status: "rejected", reason: { status: 429, message: "x", headers: { "retry-after": "15" } } },
      ],
      "manager",
    );
    expect(res?.isError).toBe(true);
    if (res?.content[0]?.type === "text") {
      expect(res.content[0].text).toContain("15");
    }
  });
});

describe("compositeToolAbortFromError", () => {
  it("delegates single reason to compositeToolAbortOnHttpError", () => {
    const res = compositeToolAbortFromError({ status: 403, message: "no" }, "vk");
    expect(res?.isError).toBe(true);
  });
});
