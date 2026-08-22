export type WeatherMode = "normal" | "hot" | "storm";
export type AutomaticWeatherMode = "hot" | "storm";
export type WeatherFreshness = "current" | "stale" | "unknown";

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
