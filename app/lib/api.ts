export type ApiResult<T = unknown> = {
  ok: boolean;
  url: string;
  status?: number;
  data?: T;
  error?: string;
};

const rawApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  "";

export const API_BASE_URL = rawApiBaseUrl
  .replace(/^Value:\s*/i, "")
  .trim()
  .replace(/\/$/, "");

async function tryFetch<T>(path: string): Promise<ApiResult<T>> {
  const url = `${API_BASE_URL}${path}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    return {
      ok: response.ok,
      url,
      status: response.status,
      data: data as T,
    };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : "Unknown fetch error",
    };
  }
}

function missingApiBaseResult<T>(): ApiResult<T> {
  return {
    ok: false,
    url: "NEXT_PUBLIC_API_BASE_URL is missing",
    error: "Add NEXT_PUBLIC_API_BASE_URL in Vercel Project Settings → Environment Variables. NEXT_PUBLIC_BACKEND_URL also works as a fallback.",
  };
}

export async function checkBackendStatus(): Promise<ApiResult> {
  if (!API_BASE_URL) return missingApiBaseResult();

  const paths = ["/", "/health", "/api/health", "/status"];

  for (const path of paths) {
    const result = await tryFetch(path);
    if (result.status && result.status >= 200 && result.status < 500) return result;
  }

  return {
    ok: false,
    url: API_BASE_URL,
    error: "Backend URL exists, but no common health endpoint responded successfully.",
  };
}

export async function refreshRideData(): Promise<ApiResult> {
  if (!API_BASE_URL) return missingApiBaseResult();

  const paths = ["/api/refresh-rides", "/api/collect", "/collect", "/refresh"];

  for (const path of paths) {
    const result = await tryFetch(path);
    if (result.ok) return result;
  }

  return {
    ok: false,
    url: API_BASE_URL,
    error: "Backend connected, but no refresh endpoint responded successfully.",
  };
}

export async function fetchRideData(): Promise<ApiResult<any[]>> {
  if (!API_BASE_URL) return missingApiBaseResult();

  // First collect the newest wait times into Railway/Postgres, then read latest rows.
  // Without this, the UI only re-read old stored wait times and looked stuck.
  await refreshRideData();

  const paths = ["/api/rides", "/rides", "/api/wait-times", "/wait-times"];

  for (const path of paths) {
    const result = await tryFetch<any[]>(path);
    if (result.ok && Array.isArray(result.data)) return result;
  }

  return {
    ok: false,
    url: API_BASE_URL,
    error: "Backend connected, but no ride-data endpoint returned an array yet.",
  };
}

export async function fetchPlanningInsights(park: string): Promise<ApiResult<any>> {
  if (!API_BASE_URL) return missingApiBaseResult();

  return tryFetch<any>(`/api/planning-insights?park=${encodeURIComponent(park)}`);
}
