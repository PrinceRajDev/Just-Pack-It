import { config } from "@/lib/config";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public fields?: string[],
  ) {
    super(message);
  }
}

const TOKEN_KEY = config.apiUrl ? `jpi.session.api:${config.apiUrl}` : "jpi.session";

function getToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const session = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "null");
    return config.apiUrl && session?.isDemo ? undefined : session?.token;
  } catch {
    return undefined;
  }
}

/** Typed fetch wrapper for the Express API. Never sends prices/roles as trusted input. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await apiResponse<T>(path, init)).data;
}

export async function apiResponse<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T; headers: Headers }> {
  if (!config.apiUrl) throw new ApiError("Backend not connected", 503, "NO_BACKEND");
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError("Couldn't reach the server. Check your connection.", 0, "NETWORK");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined")
      window.dispatchEvent(new Event("jpi:session-expired"));
    throw new ApiError(
      body?.message ?? "Something went wrong",
      res.status,
      body?.code,
      Array.isArray(body?.fields)
        ? body.fields.filter((field: unknown) => typeof field === "string")
        : undefined,
    );
  }
  return { data: body as T, headers: res.headers };
}

/** Existing list screens need complete arrays until their own cursor UI is introduced. */
export async function apiAll<T>(path: string, init: RequestInit = {}): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const url = new URL(path, "http://local.invalid");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await apiResponse<T[]>(url.pathname + url.search, init);
    if (!Array.isArray(response.data))
      throw new ApiError("Invalid catalogue response", 502, "INVALID_RESPONSE");
    items.push(...response.data);
    const next = response.headers.get("X-Next-Cursor");
    if (!next) {
      if (response.headers.get("X-Has-More") === "true")
        throw new ApiError(
          "Pagination headers are missing. Check backend CORS configuration.",
          502,
          "PAGINATION_HEADERS_MISSING",
        );
      return items;
    }
    if (seen.has(next))
      throw new ApiError("Catalogue pagination repeated a cursor", 502, "INVALID_CURSOR_CHAIN");
    seen.add(next);
    cursor = next;
  }
  throw new ApiError(
    "Catalogue is too large for this view. Narrow your search.",
    422,
    "CATALOGUE_LIMIT",
  );
}

export const sessionStorageKey = TOKEN_KEY;

/** Simulated latency for the mock layer so loading states are visible. */
export const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));
