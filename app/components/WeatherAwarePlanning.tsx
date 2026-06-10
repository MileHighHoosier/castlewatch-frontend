"use client";

import { useEffect } from "react";

const STORAGE_KEY = "castlewatch.weatherRiskMode.v1";
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
    note: "Auto-prefers Cool down · Favor A/C · Avoid hot zones · Short walks",
    planNote: "Weather guard: heat risk is active, so CastleWatch is using Cool down scoring. Prefer A/C, shade, indoor shows, water breaks, and shorter walking routes before chasing ride value.",
  },
  storm: {
    label: "Storm",
    icon: "⛈️",
    title: "Storm risk active",
    note: "Indoor first · Avoid outdoor rides · Watch closures · Shelter route",
    planNote: "Weather guard: storm risk is active. Prefer indoor attractions, shows, food, and nearby shelter. Avoid outdoor rides and long exposed walks.",
  },
};

function getWeatherMode(): WeatherMode {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "hot" || saved === "storm" || saved === "normal") return saved;
  return "normal";
}

function setWeatherMode(mode: WeatherMode) {
  window.localStorage.setItem(STORAGE_KEY, mode);
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
      border-radius: 16px;
      padding: 10px 12px;
      margin: 10px 0 0;
      background: rgba(255, 204, 102, 0.08);
      color: var(--text);
    }

    .emergency-break-active .weather-aware-card {
      opacity: 0.78;
      margin-top: 12px;
      border-style: dashed;
    }

    .emergency-break-active .weather-aware-card h3 {
      font-size: 16px;
    }

    .emergency-break-active .weather-aware-summary {
      font-size: 13px;
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

function forceCoolDownMode(panel: Element) {
  const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>(".plan-mode"));
  const coolDownButton = buttons.find((button) => button.textContent?.toLowerCase().includes("cool down"));
  if (!coolDownButton || coolDownButton.classList.contains("plan-mode-active")) return;
  coolDownButton.click();
}

function placeWeatherCard(panel: Element, card: HTMLElement) {
  const emergencyExitNote = panel.querySelector<HTMLElement>(".emergency-break-note");
  const lightningLaneTracker = panel.querySelector<HTMLElement>(".lightning-lane-tracker");

  if (panel.classList.contains("emergency-break-active") && emergencyExitNote) {
    if (lightningLaneTracker && emergencyExitNote.nextElementSibling === lightningLaneTracker) {
      emergencyExitNote.insertAdjacentElement("afterend", card);
      card.insertAdjacentElement("afterend", lightningLaneTracker);
      return;
    }

    emergencyExitNote.insertAdjacentElement("afterend", card);
    return;
  }

  const row = panel.querySelector<HTMLElement>(".weather-aware-control-row");
  row?.insertAdjacentElement("afterend", card);
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
  if (activeMode === "hot") {
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
      setWeatherMode(mode);
      renderWeatherAwarePlanning();
    });
    row.appendChild(button);
  });

  modeTabs.insertAdjacentElement("afterend", row);

  if (activeMode === "normal") return;

  const option = WEATHER_MODES[activeMode];
  const card = document.createElement("div");
  card.className = `weather-aware-card weather-aware-card-${activeMode}`;
  card.innerHTML = `
    <h3>${option.icon} Weather guard: ${option.title}</h3>
    <p class="weather-aware-summary">${option.note}</p>
  `;
  placeWeatherCard(panel, card);

  const nextCard = panel.querySelector<HTMLElement>(".next-move-card");
  if (nextCard && !panel.classList.contains("emergency-break-active")) {
    const note = document.createElement("div");
    note.className = "weather-aware-note";
    note.innerHTML = `<strong>Weather check:</strong> ${option.planNote}`;
    nextCard.insertAdjacentElement("afterend", note);
  }
}

export default function WeatherAwarePlanning() {
  useEffect(() => {
    let renderTimeout: number | null = null;
    let heatGuardInterval: number | null = null;

    function scheduleRender(event?: Event) {
      const target = event?.target as Element | null;
      if (target?.closest?.(".weather-aware-button")) return;
      if (renderTimeout) window.clearTimeout(renderTimeout);
      renderTimeout = window.setTimeout(renderWeatherAwarePlanning, 160);
    }

    function keepHeatScoringActive() {
      if (getWeatherMode() !== "hot") return;
      const panel = planPanel();
      if (!panel) return;
      forceCoolDownMode(panel);
    }

    scheduleRender();
    heatGuardInterval = window.setInterval(keepHeatScoringActive, 700);
    document.addEventListener("click", scheduleRender, { passive: true });
    document.addEventListener("touchend", scheduleRender, { passive: true });

    return () => {
      if (renderTimeout) window.clearTimeout(renderTimeout);
      if (heatGuardInterval) window.clearInterval(heatGuardInterval);
      document.removeEventListener("click", scheduleRender);
      document.removeEventListener("touchend", scheduleRender);
    };
  }, []);

  return null;
}
