export type WeatherMode = "normal" | "hot" | "storm";
export type AutomaticWeatherMode = "hot" | "storm";
export type WeatherFreshness = "current" | "stale" | "unknown";

export const WEATHER_RISK_MODE_STORAGE_KEY = "castlewatch.weatherRiskMode.v1";
export const WEATHER_MODE_SOURCE_STORAGE_KEY = "castlewatch.weatherRiskModeSource.v1";
export const WEATHER_AUTO_MODE_STORAGE_KEY = "castlewatch.weatherAutoAdvisoryMode.v1";
export const WEATHER_AUTO_HEADLINE_STORAGE_KEY = "castlewatch.weatherAutoAdvisoryHeadline.v1";
export const WEATHER_AUTO_CHECKED_STORAGE_KEY = "castlewatch.weatherAutoAdvisoryChecked.v1";
export const WEATHER_AUTO_FRESHNESS_STORAGE_KEY = "castlewatch.weatherAutoAdvisoryFreshness.v1";
export const WEATHER_MANUAL_DATE_STORAGE_KEY = "castlewatch.weatherManualOverrideDate.v1";

export type TripWeatherSnapshot = {
  mode: WeatherMode | null;
  forecastDate: string | null;
  observedAt: string | null;
  freshness: WeatherFreshness;
  source: "manual" | "auto" | null;
  headline: string | null;
};

type StorageReader = Pick<Storage, "getItem">;

function savedWeatherMode(value: string | null): WeatherMode | null {
  return value === "normal" || value === "hot" || value === "storm" ? value : null;
}

function savedFreshness(value: string | null): WeatherFreshness {
  return value === "current" || value === "stale" || value === "unknown" ? value : "unknown";
}

function isoDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function loadTripWeatherSnapshot(storage: StorageReader): TripWeatherSnapshot {
  const sourceValue = storage.getItem(WEATHER_MODE_SOURCE_STORAGE_KEY);
  const source = sourceValue === "manual" || sourceValue === "auto" ? sourceValue : null;
  const manualDate = storage.getItem(WEATHER_MANUAL_DATE_STORAGE_KEY);

  if (source === "manual") {
    return {
      mode: savedWeatherMode(storage.getItem(WEATHER_RISK_MODE_STORAGE_KEY)),
      forecastDate: /^\d{4}-\d{2}-\d{2}$/.test(manualDate || "") ? manualDate : null,
      observedAt: null,
      freshness: manualDate ? "current" : "unknown",
      source,
      headline: "Manual weather planning selection",
    };
  }

  const observedAt = storage.getItem(WEATHER_AUTO_CHECKED_STORAGE_KEY);
  const autoMode = savedWeatherMode(storage.getItem(WEATHER_AUTO_MODE_STORAGE_KEY));
  return {
    mode: autoMode || (observedAt ? "normal" : null),
    forecastDate: isoDate(observedAt),
    observedAt,
    freshness: savedFreshness(storage.getItem(WEATHER_AUTO_FRESHNESS_STORAGE_KEY)),
    source: observedAt || source === "auto" ? "auto" : null,
    headline: storage.getItem(WEATHER_AUTO_HEADLINE_STORAGE_KEY),
  };
}

export type WeatherAdvisorySnapshot = {
  mode: AutomaticWeatherMode | null;
  headline: string | null;
  lastSuccessfulCheck: string | null;
  freshness: WeatherFreshness;
};

export type WeatherRefreshData = {
  advisoryActive?: boolean;
  mode?: WeatherMode;
  headline?: string | null;
};

export type WeatherRefreshDecision = {
  snapshot: WeatherAdvisorySnapshot;
  applyAutomaticMode: boolean;
  clearPreviouslyAutomaticMode: boolean;
};

type ResolveWeatherRefreshInput = {
  requestOk: boolean;
  data?: WeatherRefreshData | null;
  prior: WeatherAdvisorySnapshot;
  nowIso: string;
};

function failedRefresh(prior: WeatherAdvisorySnapshot): WeatherRefreshDecision {
  return {
    snapshot: {
      ...prior,
      freshness: prior.lastSuccessfulCheck ? "stale" : "unknown",
    },
    applyAutomaticMode: false,
    clearPreviouslyAutomaticMode: false,
  };
}

export function resolveWeatherRefresh({
  requestOk,
  data,
  prior,
  nowIso,
}: ResolveWeatherRefreshInput): WeatherRefreshDecision {
  if (!requestOk || !data || typeof data.advisoryActive !== "boolean") {
    return failedRefresh(prior);
  }

  if (data.advisoryActive) {
    if (data.mode !== "hot" && data.mode !== "storm") {
      return failedRefresh(prior);
    }

    return {
      snapshot: {
        mode: data.mode,
        headline: data.headline?.trim() || prior.headline || "official advisory",
        lastSuccessfulCheck: nowIso,
        freshness: "current",
      },
      applyAutomaticMode: true,
      clearPreviouslyAutomaticMode: false,
    };
  }

  return {
    snapshot: {
      mode: null,
      headline: null,
      lastSuccessfulCheck: nowIso,
      freshness: "current",
    },
    applyAutomaticMode: false,
    clearPreviouslyAutomaticMode: true,
  };
}