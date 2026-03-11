/**
 * MCP config: user-centric. API base URL and Virtual Key via env; no login required.
 * Users can configure multiple Virtual Keys (own or Agent/department) for separate monitoring scopes.
 */

const ALEPHANT_API_BASE_URL = "ALEPHANT_API_BASE_URL";
const ALEPHANT_VIRTUAL_KEY = "ALEPHANT_VIRTUAL_KEY";

export function getApiBaseUrl(): string | undefined {
  const v = process.env[ALEPHANT_API_BASE_URL];
  return v?.trim() || undefined;
}

export function getVirtualKey(): string | undefined {
  const v = process.env[ALEPHANT_VIRTUAL_KEY];
  return v?.trim() || undefined;
}

/** Whether to use real backend (both Base URL and Virtual Key configured). */
export function useRealApi(): boolean {
  return !!(getApiBaseUrl() && getVirtualKey());
}
