import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadModelCatalogJson } from "./model-catalog.js";

const MODEL_CATALOG_URI = "alephant://model-catalog";

export function registerResources(server: McpServer): void {
  server.registerResource(
    "model-catalog",
    MODEL_CATALOG_URI,
    {
      description: "Static AI model catalog (offline JSON shipped with the package)",
      mimeType: "application/json",
    },
    async () => {
      const text = loadModelCatalogJson();
      return {
        contents: [
          {
            uri: MODEL_CATALOG_URI,
            mimeType: "application/json",
            text,
          },
        ],
      };
    },
  );
}
