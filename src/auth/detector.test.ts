import { describe, it, expect, afterEach } from "vitest";
import { detectAuthMode } from "./detector.js";

describe("detectAuthMode", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("throws when neither VK nor PAT", () => {
    delete process.env.ALEPHANT_VIRTUAL_KEY;
    delete process.env.ALEPHANT_PAT;
    expect(() => detectAuthMode(process.env)).toThrow(/credential|auth|missing/i);
  });

  it("throws when PAT set but ALEPHANT_WORKSPACE_ID missing", () => {
    process.env.ALEPHANT_PAT =
      "pat_wsabc_e4b7d9f1c0a53e8b0000000000000000000000000000000000000000000000";
    delete process.env.ALEPHANT_WORKSPACE_ID;
    delete process.env.ALEPHANT_VIRTUAL_KEY;
    expect(() => detectAuthMode(process.env)).toThrow(/workspace/i);
  });

  it("returns manager when PAT and workspace are set", () => {
    process.env.ALEPHANT_PAT = "pat_test";
    process.env.ALEPHANT_WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440000";
    delete process.env.ALEPHANT_VIRTUAL_KEY;
    expect(detectAuthMode(process.env)).toBe("manager");
  });

  it("returns vk when only virtual key is set", () => {
    process.env.ALEPHANT_VIRTUAL_KEY = "vk_test";
    delete process.env.ALEPHANT_PAT;
    delete process.env.ALEPHANT_WORKSPACE_ID;
    expect(detectAuthMode(process.env)).toBe("vk");
  });
});
