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

/**
 * When any parallel sub-call fails with 401/403/429, composite tools return the same UX as {@link safeCall}
 * instead of a partial JSON payload (auth/rate-limit affects the whole session).
 */
export function compositeToolAbortOnHttpError(
  results: PromiseSettledResult<unknown>[],
  mode: AuthMode,
): CallToolResult | null {
  for (const r of results) {
    if (r.status !== "rejected") continue;
    const e = toHttpLike(r.reason);
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
  }
  return null;
}

/** Same as {@link compositeToolAbortOnHttpError} for a single thrown/rejected reason (sequential handlers). */
export function compositeToolAbortFromError(reason: unknown, mode: AuthMode): CallToolResult | null {
  return compositeToolAbortOnHttpError([{ status: "rejected", reason } as PromiseRejectedResult], mode);
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
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if ("status" in o && typeof o.status === "number") {
      return {
        status: o.status,
        headers: typeof o.headers === "object" && o.headers !== null ? headerMap(o.headers) : undefined,
        code: typeof o.code === "string" ? o.code : typeof o.code === "number" ? String(o.code) : undefined,
        message: "message" in o ? String(o.message) : "Unknown error",
      };
    }
    if ("message" in o) {
      return {
        code: typeof o.code === "string" ? o.code : undefined,
        message: String(o.message),
      };
    }
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
    let text: string;
    try {
      text = JSON.stringify(data, null, 2);
    } catch {
      if (data && typeof data === "object") {
        text = JSON.stringify(data) || String(data);
      } else {
        text = String(data);
      }
    }
    return {
      content: [{ type: "text", text }],
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
    if (e.status === 400) {
      return {
        content: [{ type: "text", text: `Bad request: ${e.message}` }],
        isError: true,
      };
    }
    if (e.status === 404) {
      return {
        content: [{ type: "text", text: `Not found: ${e.message}` }],
        isError: true,
      };
    }
    if (e.status === 502) {
      return {
        content: [{ type: "text", text: "Bad gateway. The backend service is unavailable." }],
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
