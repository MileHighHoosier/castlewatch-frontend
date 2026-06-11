"use client";

import { useEffect } from "react";
import { fetchWeatherAdvisory } from "../lib/api";

const STORAGE_KEY = "castlewatch.weatherRiskMode.v1";
const AUTO_ADVISORY_KEY = "castlewatch.weatherAutoAdvisoryMode.v1";
const AUTO_ADVISORY_HEADLINE_KEY = "castlewatch.weatherAutoAdvisoryHeadline.v1";
const AUTO_ADVISORY_CHECKED_KEY = "castlewatch.weatherAutoAdvisoryChecked.v1";
const MANUAL_OVERRIDE_DATE_KEY = "castlewatch.weatherManualOverrideDate.v1";
const STYLE_ID = "castlewatch-weather-aware-style";

type WeatherMode = "normal" | "hot" | "storm";

const WEATHER_MODES: Record<WeatherMode, { label: string; icon: string; title: string; note: string; planNote: string }> = {
  normal: {
    label: "OK",
    icon: "🌤️",
    title: "Weather OK",
    note: "Normal routing",
    planNote: "Normal weather: CastleWatch can use the selected Plan mode normally.",
  },
  hot: {
    label: "Heat",
    icon: "🥵",
    title: "Heat risk active",
    note: "Advisory-aware · Auto-prefers Cool down · Favor A/C · Short walks",
    planNote: "Cool down active: favor A/C, shade, water, and short walks.",
  },
  storm: {
    label: "Storm",
    icon: "⛈️",
    title: "Storm risk active",
    note: "Shelter-first fallback · Indoor first · Avoid outdoor rides · Short exposed walks",
    planNote: "Storm guard: stay indoors/sheltered and avoid exposed walks.",
  },
};

function todayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function isWeatherMode(value: string | null): value is WeatherMode {
  return value === "hot" || value === "storm" || value === "normal";
}

function getAutoAdvisoryMode(): WeatherMode | null {
  const saved = window.localStorage.getItem(AUTO_ADVISORY_KEY);
  if (saved === "hot" || saved === "storm") return saved;
  return null;
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

  if (source === "manual" && mode === "normal") {
    window.localStorage.setItem(MANUAL_OVERRIDE_DATE_KEY, todayKey());
  }

  if (source === "manual" && mode !== "normal") {
    window.localStorage.removeItem(MANUAL_OVERRIDE_DATE_KEY);
  }
}

function setAutoAdvisory(mode: WeatherMode | null, headline?: string) {
  if (mode === "hot" || mode === "storm") {
    window.localStorage.setItem(AUTO_ADVISORY_KEY, mode);
    if (headline) window.localStorage.setItem(AUTO_ADVISORY_HEADLINE_KEY, headline);
  } else {
    window.localStorage.removeItem(AUTO_ADVISORY_KEY);
    window.localStorage.removeItem(AUTO_ADVISORY_HEADLINE_KEY);
  }
  window.localStorage.setItem(AUTO_ADVISORY_CHECKED_KEY, new Date().toISOString());
}

function autoAdvisoryHeadline() {
  return window.localStorage.getItem(AUTO_ADVISORY_HEADLINE_KEY) || "official advisory";
}

async function refreshAutoAdvisory() {
  const result = await fetchWeatherAdvisory();
  const data = result.data;

  if (!result.ok || !data || data.advisoryActive !== true) {
    setAutoAdvisory(null);
    renderWeatherAwarePlanning();
    return;
  }

  if (data.mode === "hot" || data.mode === "storm") {
    setAutoAdvisory(data.mode, data.headline || data.advisoryType || data.source);
    if (!isManualOverrideActive()) setWeatherMode(data.mode, "auto");
    renderWeatherAwarePlanning();
  }
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

    .weather-aware-note {
      border: 1px solid rgba(255, 204, 102, 0.42);
      border-radius: 14px;
      padding: 8px 10px;
      margin: 8px 0 0;
      background: rgba(255, 204, 102, 0.08);
      color: var(--text);
      font-size: 14px;
      line-height: 1.25;
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

function keepPlanContentTogether(panel: Element, note?: HTMLElement) {
  const nextCard = panel.querySelector<HTMLElement>(".next-move-card");
  if (!nextCard) return;

  const activeNote = note || panel.querySelector<HTMLElement>(".weather-aware-note");
  const routeSteps = panel.querySelector<HTMLElement>(".plan-steps:not(.emergency-break-steps)");
  const tracker = panel.querySelector<HTMLElement>(".lightning-lane-tracker");

  if (activeNote) {
    nextCard.insertAdjacentElement("afterend", activeNote);
  }

  if (routeSteps) {
    (activeNote || nextCard).insertAdjacentElement("afterend", routeSteps);
  }

  if (tracker) {
    (routeSteps || activeNote || nextCard).insertAdjacentElement("afterend", tracker);
  }
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
    button.innerHTML = `<span style="font-size:18px;line-height:1;">${option.icon}</span><strong style="font-size:12px;line-height:1.1;">${option.label}</strong>`;
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
    keepPlanContentTogether(panel);
    return;
  }

  applyWeatherPlanPresentation(panel, activeMode);

  const option = WEATHER_MODES[activeMode];
  const autoAdvisory = getAutoAdvisoryMode();
  const sourceText = autoAdvisory === activeMode && !isManualOverrideActive() ? ` · auto: ${autoAdvisoryHeadline()}` : "";
  const card = document.createElement("div");
  card.className = `weather-aware-card weather-aware-card-${activeMode}`;
  card.innerHTML = `
    <h3>${option.icon} Weather guard: ${option.title}${sourceText}</h3>
    <p class="weather-aware-summary">${option.note}</p>
  `;
  row.insertAdjacentElement("afterend", card);

  const nextCard = panel.querySelector<HTMLElement>(".next-move-card");
  if (nextCard) {
    const note = document.createElement("div");
    note.className = "weather-aware-note";
    note.innerHTML = `<strong>Weather check:</strong> ${option.planNote}`;
    keepPlanContentTogether(panel, note);
  }
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
      keepPlanContentTogether(panel);
    }

    scheduleRender();
    refreshAutoAdvisory();
    weatherGuardInterval = window.setInterval(keepWeatherScoringActive, 700);
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
