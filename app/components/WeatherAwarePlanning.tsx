"use client";

import { useEffect } from "react";

const STORAGE_KEY = "castlewatch.weatherRiskMode.v1";
const STYLE_ID = "castlewatch-weather-aware-style";

type WeatherMode = "normal" | "hot" | "storm";

const WEATHER_MODES: Record<WeatherMode, { label: string; icon: string; title: string; badges: string[]; note: string; planNote: string }> = {
  normal: {
    label: "Weather OK",
    icon: "🌤️",
    title: "Weather-aware planning ready",
    badges: ["Normal routing", "Watch heat", "Watch storms"],
    note: "Use this if the weather is comfortable and no storm risk is active.",
    planNote: "Normal weather: CastleWatch can use the selected Plan mode normally.",
  },
  hot: {
    label: "Heat risk",
    icon: "🥵",
    title: "Heat risk active",
    badges: ["Favor A/C", "Avoid hot zones", "Short walks", "Water breaks"],
    note: "Use this when it feels hot, humid, or tiring. CastleWatch should prefer Cool down / Low-stress choices and avoid long outdoor crossings.",
    planNote: "Weather guard: heat risk is active. Prefer A/C, shade, indoor shows, water breaks, and shorter walking routes before chasing ride value.",
  },
  storm: {
    label: "Storm risk",
    icon: "⛈️",
    title: "Storm risk active",
    badges: ["Indoor first", "Avoid outdoor rides", "Watch closures", "Shelter route"],
    note: "Use this when lightning, heavy rain, or outdoor ride closures are likely. CastleWatch should bias toward indoor attractions, food, shows, or safe shelter.",
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
      gap: 10px;
      margin: 12px 0 14px;
    }

    .weather-aware-button {
      border: 1px solid rgba(102, 178, 255, 0.28);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.04);
      color: var(--text);
      min-height: 74px;
      padding: 9px 7px;
      display: grid;
      place-items: center;
      gap: 5px;
      font-weight: 900;
      cursor: pointer;
    }

    .weather-aware-button-active {
      border-color: rgba(102, 178, 255, 0.85);
      background: rgba(102, 178, 255, 0.14);
      box-shadow: inset 0 -3px 0 var(--accent), 0 0 0 1px rgba(102, 178, 255, 0.22);
    }

    .weather-aware-card {
      border: 1px solid rgba(102, 178, 255, 0.42);
      border-radius: 20px;
      padding: 14px;
      background: linear-gradient(135deg, rgba(102, 178, 255, 0.12), rgba(255, 255, 255, 0.04));
      margin: 0 0 14px;
    }

    .weather-aware-card-hot {
      border-color: rgba(255, 204, 102, 0.62);
      background: linear-gradient(135deg, rgba(255, 204, 102, 0.17), rgba(255, 255, 255, 0.04));
    }

    .weather-aware-card-storm {
      border-color: rgba(165, 180, 252, 0.62);
      background: linear-gradient(135deg, rgba(129, 140, 248, 0.18), rgba(255, 255, 255, 0.04));
    }

    .weather-aware-card h3 {
      margin: 0 0 8px;
      font-size: 22px;
      line-height: 1.08;
    }

    .weather-aware-note {
      border: 1px solid rgba(255, 204, 102, 0.42);
      border-radius: 16px;
      padding: 12px 14px;
      margin: 12px 0 0;
      background: rgba(255, 204, 102, 0.08);
      color: var(--text);
    }

    @media (max-width: 420px) {
      .weather-aware-control-row {
        grid-template-columns: 1fr;
      }

      .weather-aware-button {
        min-height: 54px;
        grid-template-columns: auto 1fr;
        justify-content: start;
        text-align: left;
      }
    }
  `;
  document.head.appendChild(style);
}

function planPanel() {
  return Array.from(document.querySelectorAll(".compact-panel")).find((panel) => panel.querySelector(".plan-mode-tabs"));
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
  const row = document.createElement("div");
  row.className = "weather-aware-control-row";
  (["normal", "hot", "storm"] as WeatherMode[]).forEach((mode) => {
    const option = WEATHER_MODES[mode];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `weather-aware-button ${mode === activeMode ? "weather-aware-button-active" : ""}`;
    button.innerHTML = `<span style="font-size:22px;line-height:1;">${option.icon}</span><strong style="font-size:12px;line-height:1.1;">${option.label}</strong>`;
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
    <span class="stat-label">Weather-aware planning</span>
    <h3>${option.icon} ${option.title}</h3>
    <div class="badge-row">
      ${option.badges.map((badge) => `<span class="recommendation-badge">${badge}</span>`).join("")}
    </div>
    <p class="muted"><strong>Planning rule:</strong> ${option.note}</p>
  `;
  row.insertAdjacentElement("afterend", card);

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

    function scheduleRender(event?: Event) {
      const target = event?.target as Element | null;
      if (target?.closest?.(".weather-aware-button")) return;
      if (renderTimeout) window.clearTimeout(renderTimeout);
      renderTimeout = window.setTimeout(renderWeatherAwarePlanning, 160);
    }

    scheduleRender();
    document.addEventListener("click", scheduleRender, { passive: true });
    document.addEventListener("touchend", scheduleRender, { passive: true });

    return () => {
      if (renderTimeout) window.clearTimeout(renderTimeout);
      document.removeEventListener("click", scheduleRender);
      document.removeEventListener("touchend", scheduleRender);
    };
  }, []);

  return null;
}
