export type WeatherRiskMode = "normal" | "hot" | "storm";

export const WEATHER_RISK_STORAGE_KEY = "castlewatch.weatherRiskMode.v1";
export const WEATHER_RISK_AUTO_KEY = "castlewatch.weatherAutoAdvisoryMode.v1";
export const WEATHER_RISK_MANUAL_OVERRIDE_DATE_KEY = "castlewatch.weatherManualOverrideDate.v1";
export const WEATHER_RISK_ACTIVE_SIGNAL_KEY = "castlewatch.weatherActivePlanSignal.v1";

function todayKey() {
  return new Date().toLocaleDateString("en-CA");
}

export function isWeatherRiskMode(value: string | null): value is WeatherRiskMode {
  return value === "normal" || value === "hot" || value === "storm";
}

export function isManualWeatherOverrideActive() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(WEATHER_RISK_MANUAL_OVERRIDE_DATE_KEY) === todayKey();
}

export function getAutoWeatherRiskMode(): WeatherRiskMode | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(WEATHER_RISK_AUTO_KEY);
  return value === "hot" || value === "storm" ? value : null;
}

export function getActiveWeatherRiskMode(): WeatherRiskMode {
  if (typeof window === "undefined") return "normal";

  const autoMode = getAutoWeatherRiskMode();
  if (autoMode && !isManualWeatherOverrideActive()) return autoMode;

  const saved = window.localStorage.getItem(WEATHER_RISK_STORAGE_KEY);
  return isWeatherRiskMode(saved) ? saved : "normal";
}

export function publishActiveWeatherRiskMode(mode: WeatherRiskMode) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(WEATHER_RISK_ACTIVE_SIGNAL_KEY, mode);
  document.documentElement.dataset.castlewatchWeatherRisk = mode;
  window.dispatchEvent(new CustomEvent("castlewatch:weather-risk-change", { detail: { mode } }));
}

export function shouldUseSafeWeatherPlanMode(mode: WeatherRiskMode) {
  return mode === "hot" || mode === "storm";
}
