import axios, { type AxiosInstance } from "axios";

export type ClientAuth =
  | { kind: "vk"; token: string }
  | { kind: "pat"; token: string; workspaceId: string };

/**
 * Axios instance with baseURL and timeout only. Rate limiting happens in safeCall, not here.
 */
export function createHttpClient(baseURL: string, auth: ClientAuth, timeoutMs = 30_000): AxiosInstance {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth.token}`,
  };
  if (auth.kind === "pat") {
    headers["X-Workspace-Id"] = auth.workspaceId;
  }

  return axios.create({
    baseURL: baseURL.replace(/\/$/, ""),
    headers,
    timeout: timeoutMs,
  });
}
