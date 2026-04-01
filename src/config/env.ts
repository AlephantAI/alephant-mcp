const TRIM = (k: string) => process.env[k]?.trim() || undefined;

/** SaaS API base URL (no trailing slash required). */
export function getApiBaseUrl(): string | undefined {
  return TRIM("ALEPHANT_API_BASE_URL");
}

export function getVirtualKey(): string | undefined {
  return TRIM("ALEPHANT_VIRTUAL_KEY");
}

export function getPat(): string | undefined {
  return TRIM("ALEPHANT_PAT");
}

export function getWorkspaceId(): string | undefined {
  return TRIM("ALEPHANT_WORKSPACE_ID");
}

/**
 * Max HTTP-bound tool calls per minute. 0 disables throttling.
 * Default 60 per design §5.9.
 */
export function getRateLimitRpm(): number {
  const raw = process.env.ALEPHANT_RATE_LIMIT_RPM;
  if (raw === undefined || raw === "") return 60;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return 60;
  return n;
}

export function requireBaseUrl(): string {
  const u = getApiBaseUrl();
  if (!u) {
    throw new Error("ALEPHANT_API_BASE_URL is required");
  }
  return u.replace(/\/$/, "");
}
