export type ApiResult<T = unknown> = {
  ok: boolean;
  url: string;
  status?: number;
  data?: T;
  error?: string;
};

export const API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_BASE_URL || "")
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

export async function checkBackendStatus(): Promise<ApiResult> {
  if (!API_BASE_URL) {
    return {
      ok: false,
      url: "NEXT_PUBLIC_API_BASE_URL is missing",
      error: "Add NEXT_PUBLIC_API_BASE_URL in Vercel Project Settings → Environment Variables.",
    };
  }

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

export async function fetchRideData(): Promise<ApiResult<any[]>> {
  if (!API_BASE_URL) {
    return {
      ok: false,
      url: "NEXT_PUBLIC_API_BASE_URL is missing",
      error: "Add NEXT_PUBLIC_API_BASE_URL in Vercel.",
    };
  }

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
  if (!API_BASE_URL) {
    return {
      ok: false,
      url: "NEXT_PUBLIC_API_BASE_URL is missing",
      error: "Add NEXT_PUBLIC_API_BASE_URL in Vercel.",
    };
  }

  return tryFetch<any>(`/api/planning-insights?park=${encodeURIComponent(park)}`);
}
