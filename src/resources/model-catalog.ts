import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveCatalogPath(): string {
  return path.join(__dirname, "..", "..", "data", "model-catalog.json");
}

export function loadModelCatalogJson(): string {
  const p = resolveCatalogPath();
  return readFileSync(p, "utf8");
}
