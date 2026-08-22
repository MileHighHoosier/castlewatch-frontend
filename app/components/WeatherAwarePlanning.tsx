"use client";

import { useEffect } from "react";
import { fetchWeatherAdvisory } from "../lib/api";
import {
  resolveWeatherRefresh,
  type WeatherAdvisorySnapshot,
  type WeatherFreshness,
  type WeatherMode,
} from "../lib/weatherReliability";

const STORAGE_KEY = "castlewatch.weatherRiskMode.v1";
const MODE_SOURCE_KEY = "castlewatch.weatherRiskModeSource.v1";
const AUTO_ADVISORY_KEY = "castlewatch.weatherAutoAdvisoryMode.v1";
const AUTO_ADVISORY_HEADLINE_KEY = "castlewatch.weatherAutoAdvisoryHeadline.v1";
const AUTO_ADVISORY_CHECKED_KEY = "castlewatch.weatherAutoAdvisoryChecked.v1";
const AUTO_ADVISORY_FRESHNESS_KEY = "castlewatch.weatherAutoAdvisoryFreshness.v1";
const MANUAL_OVERRIDE_DATE_KEY = "castlewatch.weatherManualOverrideDate.v1";
const STYLE_ID = "castlewatch-weather-aware-style";

const WEATHER_MODES: Record<WeatherMode, { label: string; icon: string; title: string; note: string }> = {
  normal: {
    label: "OK",
    icon: "🌤️",
    title: "Weather OK",
    note: "Normal routing",
  },
  hot: {
    label: "Heat",
    icon: "🥵",
    title: "Heat risk active",
    note: "Advisory-aware · Auto-prefers Cool down · Favor A/C · Short walks",
  },
  storm: {
    label: "Storm",
    icon: "⛈️",
    title: "Storm risk active",
    note: "Shelter-first fallback · Indoor first · Avoid outdoor rides · Short exposed walks",
  },
};

function todayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function isWeatherMode(value: string | null): value is WeatherMode {
  return value === "hot" || value === "storm" || value === "normal";
}

function getAutoAdvisoryMode(): "hot" | "storm" | null {
  const saved = window.localStorage.getItem(AUTO_ADVISORY_KEY);
  if (saved === "hot" || saved === "storm") return saved;
  return null;
}

function getWeatherModeSource(): "manual" | "auto" | null {
  const saved = window.localStorage.getItem(MODE_SOURCE_KEY);
  return saved === "manual" || saved === "auto" ? saved : null;
}

function getAutoAdvisoryFreshness(): WeatherFreshness | null {
  const saved = window.localStorage.getItem(AUTO_ADVISORY_FRESHNESS_KEY);
  if (saved === "current" || saved === "stale" || saved === "unknown") return saved;
  return null;
}

function getAutoAdvisorySnapshot(): WeatherAdvisorySnapshot {
  return {
    mode: getAutoAdvisoryMode(),
    headline: window.localStorage.getItem(AUTO_ADVISORY_HEADLINE_KEY),
    lastSuccessfulCheck: window.localStorage.getItem(AUTO_ADVISORY_CHECKED_KEY),
    freshness: getAutoAdvisoryFreshness() || "unknown",
  };
}

function isManualOverrideActive() {
  return window.localStorage.getItem(MANUAL_OVERRIDE_DATE_KEY) === todayKey();
}

function getWeatherMode(): WeatherMode {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  const autoAdvisoryMode = getAutoAdvisoryMode();

  if (autoAdvisoryMode && !isManualOverrideActive()) {
    return autoAdvisoryMode;
  }

  if (isWeatherMode(saved)) return saved;
  return "normal";
}

function setWeatherMode(mode: WeatherMode, source: "manual" | "auto" = "manual") {
  window.localStorage.setItem(STORAGE_KEY, mode);
  window.localStorage.setItem(MODE_SOURCE_KEY, source);

  if (source === "manual" && mode === "normal") {
    window.localStorage.setItem(MANUAL_OVERRIDE_DATE_KEY, todayKey());
  }

  if (source === "manual" && mode !== "normal") {
    window.localStorage.removeItem(MANUAL_OVERRIDE_DATE_KEY);
  }
}

function storeAutoAdvisory(snapshot: WeatherAdvisorySnapshot) {
  if (snapshot.mode === "hot" || snapshot.mode === "storm") {
    window.localStorage.setItem(AUTO_ADVISORY_KEY, snapshot.mode);
    if (snapshot.headline) {
      window.localStorage.setItem(AUTO_ADVISORY_HEADLINE_KEY, snapshot.headline);
    }
  } else {
    window.localStorage.removeItem(AUTO_ADVISORY_KEY);
    window.localStorage.removeItem(AUTO_ADVISORY_HEADLINE_KEY);
  }

  window.localStorage.setItem(AUTO_ADVISORY_FRESHNESS_KEY, snapshot.freshness);
  if (snapshot.lastSuccessfulCheck) {
    window.localStorage.setItem(AUTO_ADVISORY_CHECKED_KEY, snapshot.lastSuccessfulCheck);
  }
}

function autoAdvisoryHeadline() {
  return window.localStorage.getItem(AUTO_ADVISORY_HEADLINE_KEY) || "official advisory";
}

function lastSuccessfulWeatherCheck() {
  const value = window.localStorage.getItem(AUTO_ADVISORY_CHECKED_KEY);
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function refreshAutoAdvisory() {
  const result = await fetchWeatherAdvisory();
  const data = result.data;
  const priorAutoMode = getAutoAdvisoryMode();
  const decision = resolveWeatherRefresh({
    requestOk: result.ok && Boolean(data),
    data: data ? {
      advisoryActive: data.advisoryActive,
      mode: data.mode,
      headline: data.headline || data.advisoryType || data.source || null,
    } : null,
    prior: getAutoAdvisorySnapshot(),
    nowIso: new Date().toISOString(),
  });

  storeAutoAdvisory(decision.snapshot);

  if (decision.clearPreviouslyAutomaticMode) {
    const source = getWeatherModeSource();
    const savedMode = window.localStorage.getItem(STORAGE_KEY);
    const looksLikeLegacyAutoMode = !source && priorAutoMode && savedMode === priorAutoMode;
    if (source === "auto" || looksLikeLegacyAutoMode) {
      setWeatherMode("normal", "auto");
    }
  }

  if (decision.applyAutomaticMode && decision.snapshot.mode && !isManualOverrideActive()) {
    setWeatherMode(decision.snapshot.mode, "auto");
  }

  renderWeatherAwarePlanning();
}

function ensureWeatherStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .weather-aware-control-row {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 10px 0 12px;
    }

    .weather-aware-button {
      border: 1px solid rgba(102, 178, 255, 0.28);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.04);
      color: var(--text);
      min-height: 42px;
      padding: 7px 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-weight: 900;
      cursor: pointer;
      white-space: nowrap;
    }

    .weather-aware-button-active {
      border-color: rgba(102, 178, 255, 0.85);
      background: rgba(102, 178, 255, 0.14);
      box-shadow: inset 0 -3px 0 var(--accent), 0 0 0 1px rgba(102, 178, 255, 0.22);
    }

    .weather-aware-card {
      border: 1px solid rgba(102, 178, 255, 0.42);
      border-radius: 16px;
      padding: 10px 12px;
      background: linear-gradient(135deg, rgba(102, 178, 255, 0.12), rgba(255, 255, 255, 0.04));
      margin: 0 0 12px;
    }

    .weather-aware-card-hot {
      border-color: rgba(255, 204, 102, 0.62);
      background: linear-gradient(135deg, rgba(255, 204, 102, 0.16), rgba(255, 255, 255, 0.04));
    }

    .weather-aware-card-storm {
      border-color: rgba(165, 180, 252, 0.62);
      background: linear-gradient(135deg, rgba(129, 140, 248, 0.16), rgba(255, 255, 255, 0.04));
    }

    .weather-aware-card-stale {
      border-color: rgba(251, 191, 36, 0.66);
      background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(255, 255, 255, 0.04));
    }

    .weather-aware-card h3 {
      margin: 0 0 5px;
      font-size: 18px;
      line-height: 1.08;
    }

    .weather-aware-summary {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.25;
      font-weight: 750;
    }

    .emergency-break-active .weather-aware-control-row {
      opacity: 0.64;
      transform: scale(0.96);
      transform-origin: top center;
      margin-top: 6px;
      margin-bottom: 8px;
    }

    .emergency-break-active .weather-aware-button {
      min-height: 36px;
      padding: 5px 7px;
      border-style: dashed;
    }

    .emergency-break-active .weather-aware-button span {
      font-size: 16px !important;
    }

    .emergency-break-active .weather-aware-button strong {
      font-size: 11px !important;
    }

    @media (max-width: 360px) {
      .weather-aware-control-row {
        grid-template-columns: 1fr;
      }

      .weather-aware-button {
        justify-content: center;
        min-height: 40px;
      }
    }
  `;
  document.head.appendChild(style);
}

function planPanel() {
  return Array.from(document.querySelectorAll(".compact-panel")).find((panel) => panel.querySelector(".plan-mode-tabs"));
}

function selectedPlanModeLabel(panel: Element) {
  const activeButton = panel.querySelector<HTMLElement>(".plan-mode-active");
  const text = activeButton?.textContent?.replace(/[⚡😌❄️]/g, "").trim();
  return text || "Plan";
}

function forceCoolDownMode(panel: Element) {
  const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>(".plan-mode"));
  const coolDownButton = buttons.find((button) => button.textContent?.toLowerCase().includes("cool down"));
  if (!coolDownButton || coolDownButton.classList.contains("plan-mode-active")) return;
  coolDownButton.click();
}

function shouldForceSafeWeatherMode(mode: WeatherMode) {
  return mode === "hot" || mode === "storm";
}

function applyWeatherPlanPresentation(panel: Element, mode: WeatherMode) {
  if (mode === "normal" || panel.classList.contains("emergency-break-active")) return;

  const nextCard = panel.querySelector<HTMLElement>(".next-move-card");
  if (!nextCard) return;

  const label = nextCard.querySelector<HTMLElement>(".stat-label");
  if (label) {
    label.textContent = mode === "storm" ? "Next move · Storm guard · Cool down" : "Next move · Heat guard · Cool down";
  }

  const badgeRow = nextCard.querySelector<HTMLElement>(".badge-row");
  if (badgeRow && !badgeRow.textContent?.includes("Weather guard")) {
    const badge = document.createElement("span");
    badge.className = "recommendation-badge weather-guard-badge";
    badge.textContent = "Weather guard";
    badgeRow.prepend(badge);
  }
}

function resetWeatherPlanPresentation(panel: Element) {
  const nextCard = panel.querySelector<HTMLElement>(".next-move-card");
  if (!nextCard) return;

  const label = nextCard.querySelector<HTMLElement>(".stat-label");
  if (label && /Heat guard|Storm guard/.test(label.textContent || "")) {
    label.textContent = `Next move · ${selectedPlanModeLabel(panel)}`;
  }

  nextCard.querySelectorAll<HTMLElement>(".weather-guard-badge").forEach((badge) => badge.remove());
}

function insertWeatherCard(row: Element, className: string, title: string, summary: string) {
  const card = document.createElement("div");
  card.className = `weather-aware-card ${className}`.trim();

  const heading = document.createElement("h3");
  heading.textContent = title;
  card.appendChild(heading);

  const paragraph = document.createElement("p");
  paragraph.className = "weather-aware-summary";
  paragraph.textContent = summary;
  card.appendChild(paragraph);

  row.insertAdjacentElement("afterend", card);
}

function degradedWeatherSummary() {
  const autoMode = getAutoAdvisoryMode();
  const lastCheck = lastSuccessfulWeatherCheck();
  const checkText = lastCheck ? ` Last successful check: ${lastCheck}.` : "";

  if (autoMode) {
    const risk = autoMode === "hot" ? "heat" : "storm";
    if (isManualOverrideActive()) {
      return `Automatic weather data is stale. The last known ${risk} advisory is retained, but today's manual Weather OK override remains active.${checkText}`;
    }
    return `Automatic weather data is stale. CastleWatch is retaining the last known ${risk} guard until a successful check confirms conditions changed.${checkText}`;
  }

  return `Automatic weather data is unavailable. CastleWatch is not treating the failed check as confirmation that conditions are normal; manual weather controls remain available.${checkText}`;
}

function renderWeatherAwarePlanning() {
  ensureWeatherStyle();
  const panel = planPanel();
  const modeTabs = panel?.querySelector(".plan-mode-tabs");
  if (!panel || !modeTabs) return;

  panel.querySelector(".weather-aware-control-row")?.remove();
  panel.querySelector(".weather-aware-card")?.remove();
  panel.querySelector(".weather-aware-note")?.remove();

  const activeMode = getWeatherMode();
  const freshness = getAutoAdvisoryFreshness();
  const degradedWeather = freshness === "stale" || freshness === "unknown";

  if (shouldForceSafeWeatherMode(activeMode)) {
    forceCoolDownMode(panel);
  }

  const row = document.createElement("div");
  row.className = "weather-aware-control-row";
  (["normal", "hot", "storm"] as WeatherMode[]).forEach((mode) => {
    const option = WEATHER_MODES[mode];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `weather-aware-button ${mode === activeMode ? "weather-aware-button-active" : ""}`;

    const icon = document.createElement("span");
    icon.style.fontSize = "18px";
    icon.style.lineHeight = "1";
    icon.textContent = option.icon;
    button.appendChild(icon);

    const label = document.createElement("strong");
    label.style.fontSize = "12px";
    label.style.lineHeight = "1.1";
    label.textContent = option.label;
    button.appendChild(label);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setWeatherMode(mode, "manual");
      renderWeatherAwarePlanning();
    });
    row.appendChild(button);
  });

  modeTabs.insertAdjacentElement("afterend", row);

  if (activeMode === "normal" || panel.classList.contains("emergency-break-active")) {
    resetWeatherPlanPresentation(panel);
    if (degradedWeather) {
      insertWeatherCard(row, "weather-aware-card-stale", "⚠️ Weather status unavailable", degradedWeatherSummary());
    }
    return;
  }

  applyWeatherPlanPresentation(panel, activeMode);

  const option = WEATHER_MODES[activeMode];
  const autoAdvisory = getAutoAdvisoryMode();
  const isAutomatic = autoAdvisory === activeMode && !isManualOverrideActive();
  const sourceText = isAutomatic
    ? freshness === "stale" || freshness === "unknown"
      ? ` · last known: ${autoAdvisoryHeadline()}`
      : ` · auto: ${autoAdvisoryHeadline()}`
    : "";
  const staleText = degradedWeather
    ? " Weather check unavailable; retaining the last known guard until a successful update."
    : "";

  insertWeatherCard(
    row,
    `weather-aware-card-${activeMode}${degradedWeather ? " weather-aware-card-stale" : ""}`,
    `${option.icon} Weather guard: ${option.title}${sourceText}`,
    `${option.note}${staleText}`,
  );
}

export default function WeatherAwarePlanning() {
  useEffect(() => {
    let renderTimeout: number | null = null;
    let weatherGuardInterval: number | null = null;
    let advisoryInterval: number | null = null;

    function scheduleRender(event?: Event) {
      const target = event?.target as Element | null;
      if (target?.closest?.(".weather-aware-button")) return;
      if (renderTimeout) window.clearTimeout(renderTimeout);
      renderTimeout = window.setTimeout(renderWeatherAwarePlanning, 160);
    }

    function keepWeatherScoringActive() {
      const mode = getWeatherMode();
      const panel = planPanel();
      if (!panel) return;
      if (shouldForceSafeWeatherMode(mode)) {
        forceCoolDownMode(panel);
        applyWeatherPlanPresentation(panel, mode);
      } else {
        resetWeatherPlanPresentation(panel);
      }
    }

    scheduleRender();
    refreshAutoAdvisory();
    weatherGuardInterval = window.setInterval(keepWeatherScoringActive, 1200);
    advisoryInterval = window.setInterval(refreshAutoAdvisory, 10 * 60 * 1000);
    document.addEventListener("click", scheduleRender, { passive: true });
    document.addEventListener("touchend", scheduleRender, { passive: true });

    return () => {
      if (renderTimeout) window.clearTimeout(renderTimeout);
      if (weatherGuardInterval) window.clearInterval(weatherGuardInterval);
      if (advisoryInterval) window.clearInterval(advisoryInterval);
      document.removeEventListener("click", scheduleRender);
      document.removeEventListener("touchend", scheduleRender);
    };
  }, []);

  return null;
}
