import type { AuthMode } from "./types.js";

/**
 * PAT takes precedence when non-empty after trim.
 * Throws Error on invalid configuration (never calls process.exit).
 */
export function detectAuthMode(env: NodeJS.ProcessEnv): AuthMode {
  const pat = env.ALEPHANT_PAT?.trim();
  if (pat) {
    const ws = env.ALEPHANT_WORKSPACE_ID?.trim();
    if (!ws) {
      throw new Error("ALEPHANT_WORKSPACE_ID is required when ALEPHANT_PAT is set");
    }
    return "manager";
  }

  const vk = env.ALEPHANT_VIRTUAL_KEY?.trim();
  if (vk) {
    return "vk";
  }

  throw new Error(
    "Missing Alephant credentials: set ALEPHANT_VIRTUAL_KEY (VK mode) or ALEPHANT_PAT with ALEPHANT_WORKSPACE_ID (manager mode)",
  );
}
