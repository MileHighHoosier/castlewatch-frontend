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

const THEMEPARKS_WIKI_PARK_IDS: Record<string, string> = {
  "Magic Kingdom": "75ea578a-adc8-4116-a54d-dccb60765ef9",
  Epcot: "47f90d2c-e191-4239-a466-5892ef59a88b",
  "Hollywood Studios": "89db5d43-c434-4097-b71f-f6869f495a22",
  "Animal Kingdom": "1c84a229-8862-4648-9c71-378ddd2c7693",
};

export type ShowTimeEntry = {
  startTime?: string;
  endTime?: string;
  status?: string;
  isPast?: boolean;
};

export type ParkShow = {
  id?: string;
  name: string;
  park?: string;
  land?: string;
  status?: string;
  nextStartTime?: string | null;
  times: ShowTimeEntry[];
  upcomingCount?: number;
};

export type ShowTimesResult = {
  park: string;
  shows: ParkShow[];
  source?: string;
  updated_at?: string;
  status?: string;
};

export type CharacterMeet = {
  id?: string;
  name: string;
  park: string;
  land?: string;
  status?: string;
  nextStartTime?: string | null;
  times: ShowTimeEntry[];
  upcomingCount?: number;
};

export type CharacterMeetResult = {
  park: string;
  characters: CharacterMeet[];
  source?: string;
  updated_at?: string;
  status?: string;
};

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

async function tryFetchAbsolute<T>(url: string): Promise<ApiResult<T>> {
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

function normalizeRideRows<T>(rows: T[]): T[] {
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;

    const ride = row as Record<string, unknown>;
    const name = String(ride.name || ride.ride_name || ride.attraction || "").toLowerCase();

    if (!name.includes("main street vehicles")) return row;

    return {
      ...ride,
      park: "Transport",
      land: "Transportation filler",
      castlewatch_category: "transportation filler",
    } as T;
  });
}

function parseShowTime(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function scheduleTimesFromItem(item: any) {
  const schedule = Array.isArray(item?.showtimes) ? item.showtimes : Array.isArray(item?.schedule) ? item.schedule : [];
  const now = new Date();

  return schedule.flatMap((entry: any): ShowTimeEntry[] => {
    const startTime = entry?.startTime || entry?.start || entry?.time;
    const start = parseShowTime(startTime);
    if (!start) return [];
    return [{
      startTime,
      endTime: entry?.endTime || entry?.end,
      status: entry?.type || entry?.status || "Scheduled",
      isPast: start < now,
    }];
  });
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(value: string, keywords: string[]) {
  const normalized = normalizeText(value);
  return keywords.some((keyword) => normalized.includes(normalizeText(keyword)));
}

const CHARACTER_INCLUDE_KEYWORDS = [
  "adventurers outpost",
  "celebrity spotlight",
  "character landing",
  "character meet",
  "character greeting",
  "fairytale hall",
  "greeting",
  "meet ",
  "meet-",
  "meet and greet",
  "meet disney",
  "princess fairytale hall",
  "royal sommerhus",
  "star wars launch bay",
  "town square theater",
];

const CHARACTER_EXCLUDE_KEYWORDS = [
  "buzz lightyear",
  "cinderella castle",
  "journey into imagination",
  "mickey & minnie's runaway railway",
  "mickey and minnie's runaway railway",
  "mickey's philharmagic",
  "monsters inc. laugh floor",
  "peter pan's flight",
  "the many adventures of winnie the pooh",
  "tiana's bayou adventure",
];

function isCharacterMeetEntity(item: any) {
  const name = String(item?.name || item?.entityName || "");
  const entityType = String(item?.entityType || item?.type || "").toUpperCase();
  const combined = `${name} ${item?.land || ""} ${item?.area || ""}`;

  if (includesAny(combined, CHARACTER_EXCLUDE_KEYWORDS)) return false;
  if (entityType.includes("MEET") || entityType.includes("CHARACTER")) return true;
  return includesAny(combined, CHARACTER_INCLUDE_KEYWORDS);
}

function normalizeExternalShowTimes(park: string, data: any, source: string): ShowTimesResult {
  const liveData = Array.isArray(data?.liveData) ? data.liveData : [];

  const shows = liveData.flatMap((item: any): ParkShow[] => {
    const times = scheduleTimesFromItem(item);
    const entityType = String(item?.entityType || item?.type || "").toUpperCase();
    if (!times.length && !["SHOW", "ENTERTAINMENT", "PARADE"].includes(entityType)) return [];

    if (!times.length) return [];
    const upcoming = times.filter((time) => !time.isPast);

    return [{
      id: item?.id || item?.entityId,
      name: item?.name || item?.entityName || "Show",
      park,
      land: item?.land || item?.area || "Entertainment",
      status: item?.status || "SCHEDULED",
      nextStartTime: upcoming[0]?.startTime || null,
      times: times.slice(0, 12),
      upcomingCount: upcoming.length,
    }];
  }).sort((a: ParkShow, b: ParkShow) => String(a.nextStartTime || "9999").localeCompare(String(b.nextStartTime || "9999")) || a.name.localeCompare(b.name));

  return {
    park,
    shows,
    source,
    updated_at: new Date().toISOString(),
  };
}

function normalizeExternalCharacterMeets(park: string, data: any, source: string): CharacterMeetResult {
  const liveData = Array.isArray(data?.liveData) ? data.liveData : [];

  const characters = liveData.flatMap((item: any): CharacterMeet[] => {
    if (!isCharacterMeetEntity(item)) return [];

    const times = scheduleTimesFromItem(item);
    const upcoming = times.filter((time) => !time.isPast);

    return [{
      id: item?.id || item?.entityId,
      name: item?.name || item?.entityName || "Character greeting",
      park,
      land: item?.land || item?.area || "Character greeting",
      status: item?.status || "VERIFY_IN_APP",
      nextStartTime: upcoming[0]?.startTime || null,
      times: times.slice(0, 12),
      upcomingCount: upcoming.length,
    }];
  }).sort((a: CharacterMeet, b: CharacterMeet) => String(a.nextStartTime || "9999").localeCompare(String(b.nextStartTime || "9999")) || a.name.localeCompare(b.name));

  return {
    park,
    characters,
    source,
    updated_at: new Date().toISOString(),
  };
}

export type WeatherAdvisoryResult = {
  mode?: "normal" | "hot" | "storm";
  advisoryActive?: boolean;
  advisoryType?: string;
  headline?: string;
  expiresAt?: string;
  source?: string;
};

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
    if (result.ok && Array.isArray(result.data)) {
      return {
        ...result,
        data: normalizeRideRows(result.data),
      };
    }
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

export async function fetchShowTimes(park: string): Promise<ApiResult<ShowTimesResult>> {
  if (API_BASE_URL) {
    const backendResult = await tryFetch<ShowTimesResult>(`/api/show-times?park=${encodeURIComponent(park)}`);
    if (backendResult.ok && backendResult.data && Array.isArray(backendResult.data.shows)) return backendResult;
  }

  const parkId = THEMEPARKS_WIKI_PARK_IDS[park];
  if (!parkId) {
    return {
      ok: false,
      url: "themeparks.wiki unsupported park",
      error: `No showtime source configured for ${park}.`,
    };
  }

  const url = `https://api.themeparks.wiki/v1/entity/${parkId}/live`;
  const result = await tryFetchAbsolute<any>(url);
  if (!result.ok) return result as ApiResult<ShowTimesResult>;

  return {
    ok: true,
    url,
    status: result.status,
    data: normalizeExternalShowTimes(park, result.data, url),
  };
}

export async function fetchCharacterMeets(park: string): Promise<ApiResult<CharacterMeetResult>> {
  const parkId = THEMEPARKS_WIKI_PARK_IDS[park];
  if (!parkId) {
    return {
      ok: false,
      url: "themeparks.wiki unsupported park",
      error: `No character source configured for ${park}.`,
    };
  }

  const url = `https://api.themeparks.wiki/v1/entity/${parkId}/live`;
  const result = await tryFetchAbsolute<any>(url);
  if (!result.ok) return result as ApiResult<CharacterMeetResult>;

  return {
    ok: true,
    url,
    status: result.status,
    data: normalizeExternalCharacterMeets(park, result.data, url),
  };
}

export async function fetchWeatherAdvisory(): Promise<ApiResult<WeatherAdvisoryResult>> {
  if (!API_BASE_URL) return missingApiBaseResult();

  const paths = ["/api/weather-advisory", "/api/weather/alerts", "/weather-advisory"];

  for (const path of paths) {
    const result = await tryFetch<WeatherAdvisoryResult>(path);
    if (result.ok && result.data && typeof result.data === "object") return result;
  }

  return {
    ok: false,
    url: API_BASE_URL,
    error: "Backend connected, but no weather advisory endpoint returned advisory data yet.",
  };
}
