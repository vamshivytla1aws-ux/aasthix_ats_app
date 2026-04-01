export class ApiError extends Error {
  status: number;
  payload?: unknown;
  /** Correlates client logs with server logs (header or client-generated). */
  requestId?: string;

  constructor(message: string, status: number, payload?: unknown, requestId?: string) {
    super(message);
    this.status = status;
    this.payload = payload;
    this.requestId = requestId;
  }
}

function newClientRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function redirectToLoginWithExpiredSession() {
  if (typeof window === "undefined") return;
  const url = new URL("/login", window.location.origin);
  url.searchParams.set("message", "Session expired, please login again");
  url.searchParams.set("next", window.location.pathname + window.location.search);
  window.location.assign(url.toString());
}

export async function apiFetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const clientRequestId = newClientRequestId();
  const headers = new Headers(init?.headers ?? undefined);
  if (!headers.has("X-Client-Request-Id")) {
    headers.set("X-Client-Request-Id", clientRequestId);
  }
  const mergedInit: RequestInit = { ...init, headers };

  let res: Response;
  try {
    res = await fetch(input, mergedInit);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error";
    throw new ApiError(msg, 0, undefined, clientRequestId);
  }

  const requestId =
    res.headers.get("x-request-id") ||
    res.headers.get("X-Request-Id") ||
    clientRequestId;

  let payload: unknown = null;
  const contentType = res.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      payload = await res.json().catch(() => null);
    } else {
      payload = await res.text().catch(() => null);
    }
  } catch (parseError) {
    console.warn("Failed to parse response payload:", parseError);
    payload = null;
  }

  if (res.status === 401) {
    redirectToLoginWithExpiredSession();
    throw new ApiError("Unauthorized", 401, payload, requestId);
  }

  if (!res.ok) {
    let message = res.statusText || "Request failed";
    if (payload && typeof payload === "object" && payload !== null && "error" in payload) {
      const e = (payload as { error?: unknown }).error;
      if (typeof e === "string") message = e;
      else if (e != null && typeof e === "object" && e !== null && "message" in e) {
        const msg = (e as { message?: unknown }).message;
        if (typeof msg === "string") message = msg;
        else if (msg != null) message = String(msg);
      } else if (e != null) {
        message = String(e);
      }
    }
    throw new ApiError(message, res.status, payload, requestId);
  }

  return payload as T;
}

