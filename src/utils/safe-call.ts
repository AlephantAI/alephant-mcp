import axios from "axios";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AuthMode } from "../auth/types.js";
import { acquireGlobalRateSlot } from "./rate-limiter.js";

export type HttpLikeError = {
  status?: number;
  headers?: Record<string, string>;
  code?: string;
  message: string;
};

function headerMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k.toLowerCase()] = v;
    else if (typeof v === "number") out[k.toLowerCase()] = String(v);
    else if (Array.isArray(v)) out[k.toLowerCase()] = v.join(", ");
  }
  return out;
}

export function toHttpLike(err: unknown): HttpLikeError {
  if (axios.isAxiosError(err)) {
    return {
      status: err.response?.status,
      headers: headerMap(err.response?.headers),
      code: err.code,
      message: err.message,
    };
  }
  if (err && typeof err === "object" && "message" in err) {
    const o = err as Record<string, unknown>;
    return {
      status: typeof o.status === "number" ? o.status : undefined,
      headers: typeof o.headers === "object" && o.headers !== null ? headerMap(o.headers) : undefined,
      code: typeof o.code === "string" ? o.code : undefined,
      message: String(o.message),
    };
  }
  return { message: err instanceof Error ? err.message : String(err) };
}

export async function safeCall<T>(
  fn: () => Promise<T>,
  mode: AuthMode,
): Promise<CallToolResult> {
  await acquireGlobalRateSlot();
  try {
    const data = await fn();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  } catch (err) {
    const e = toHttpLike(err);
    const statusLabel = e.status ? `HTTP ${e.status}` : e.code ?? "unknown";
    console.error(`[safeCall] ${statusLabel}: ${e.message}`);
    if (e.status === 401) {
      const hint =
        mode === "vk"
          ? "Check your ALEPHANT_VIRTUAL_KEY."
          : "Check your ALEPHANT_PAT and ALEPHANT_WORKSPACE_ID.";
      return {
        content: [{ type: "text", text: `Authentication failed. ${hint}` }],
        isError: true,
      };
    }
    if (e.status === 403) {
      return {
        content: [
          {
            type: "text",
            text: "Permission denied. This operation requires manager mode (PAT) or higher scope.",
          },
        ],
        isError: true,
      };
    }
    if (e.status === 429) {
      const retryAfter = e.headers?.["retry-after"] ?? "60";
      return {
        content: [
          { type: "text", text: `Rate limit exceeded. Retry after ${retryAfter} seconds.` },
        ],
        isError: true,
      };
    }
    if (e.status === 504) {
      return {
        content: [
          {
            type: "text",
            text: "Gateway timeout. The backend service is slow to respond.",
          },
        ],
        isError: true,
      };
    }
    if (e.status === 500) {
      return {
        content: [{ type: "text", text: "Internal server error. Please contact support." }],
        isError: true,
      };
    }
    if (e.code === "ETIMEDOUT" || e.code === "ECONNABORTED") {
      return {
        content: [
          {
            type: "text",
            text: "Request timeout. Check your network connection or API availability.",
          },
        ],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: `Unexpected error: ${e.message}` }],
      isError: true,
    };
  }
}
