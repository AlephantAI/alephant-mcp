import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("marketplace metadata", () => {
  it("keeps official registry metadata aligned with the npm package", () => {
    const pkg = readJson<{ name: string; version: string; mcpName: string }>("package.json");
    const server = readJson<{
      name: string;
      version: string;
      packages: Array<{ registryType: string; identifier: string; version: string }>;
    }>("server.json");

    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.packages).toHaveLength(1);
    expect(server.packages[0]).toMatchObject({
      registryType: "npm",
      identifier: pkg.name,
      version: pkg.version,
    });
  });
});
