"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchPlanningInsights } from "../lib/api";

const STYLE_ID = "castlewatch-day-trend-style";
const CARD_CLASS = "castlewatch-day-trend-card";

type ForecastWindow = {
  label?: string;
  window?: string;
  average_wait?: number;
  samples?: number;
  distinct_days?: number;
};

type TomorrowForecast = {
  date?: string;
  weekday?: string;
  timezone?: string;
  status?: "ready" | "fallback" | "learning";
  source?: "same_weekday" | "overall_baseline" | "insufficient_data";
  comparison?: string;
  summary?: string;
  confidence?: {
    level?: string;
    label?: string;
  };
  best_window?: ForecastWindow | null;
  peak_window?: ForecastWindow | null;
};

type PlanningInsights = {
  tomorrow_forecast?: TomorrowForecast;
};

type ForecastView = {
  title: string;
  detail: string;
  confidence: string;
  bestWindow?: string;
  peakWindow?: string;
  sourceNote: string;
};

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${CARD_CLASS} {
      border: 1px solid rgba(56, 217, 150, 0.42);
      border-radius: 18px;
      padding: 12px;
      margin: 14px 0 8px;
      background: rgba(56, 217, 150, 0.08);
    }

    .${CARD_CLASS} h3,
    .${CARD_CLASS} p {
      margin-top: 0;
    }

    .castlewatch-day-trend-heading {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 10px;
    }

    .castlewatch-day-trend-label {
      font-size: 20px;
      line-height: 1.1;
      margin-bottom: 5px;
    }

    .castlewatch-day-trend-pill {
      border: 1px solid rgba(56, 217, 150, 0.38);
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 900;
      white-space: nowrap;
      background: rgba(56, 217, 150, 0.06);
    }

    .castlewatch-tomorrow-windows {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 10px;
    }

    .castlewatch-tomorrow-window {
      border: 1px solid rgba(56, 217, 150, 0.24);
      border-radius: 12px;
      padding: 9px 10px;
      background: rgba(255, 255, 255, 0.035);
    }

    .castlewatch-tomorrow-window span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      font-weight: 900;
      margin-bottom: 3px;
    }

    .castlewatch-tomorrow-window strong {
      font-size: 14px;
      line-height: 1.2;
    }

    .castlewatch-tomorrow-source {
      margin: 9px 0 0;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.35;
    }

    @media (max-width: 640px) {
      .castlewatch-tomorrow-windows {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}

function tomorrowWeekday() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toLocaleDateString([], { weekday: "long" });
}

function buildView(insights: PlanningInsights | null, loading: boolean): ForecastView {
  if (loading) {
    return {
      title: `Tomorrow: ${tomorrowWeekday()} forecast`,
      detail: "Loading weekday-aware historical patterns...",
      confidence: "Calculating",
      sourceNote: "Using Walt Disney World Eastern Time.",
    };
  }

  const forecast = insights?.tomorrow_forecast;
  const weekday = forecast?.weekday || tomorrowWeekday();

  if (!forecast || forecast.status === "learning" || forecast.source === "insufficient_data") {
    return {
      title: `Tomorrow: ${weekday} forecast`,
      detail: forecast?.summary || "CastleWatch is still collecting enough history to forecast tomorrow.",
      confidence: forecast?.confidence?.label || "Low confidence",
      sourceNote: "The forecast will become more specific as additional park-day history is collected.",
    };
  }

  const bestWindow = forecast.best_window?.window;
  const peakWindow = forecast.peak_window?.window;
  const sourceNote = forecast.source === "same_weekday"
    ? `Based on prior ${weekday}s in Walt Disney World Eastern Time.`
    : `Matching ${weekday} history is still limited, so this uses the park's overall time-of-day pattern.`;

  return {
    title: `Tomorrow: ${weekday} forecast`,
    detail: forecast.summary || `CastleWatch found a historical pattern for ${weekday}.`,
    confidence: forecast.confidence?.label || "Early signal",
    bestWindow,
    peakWindow: peakWindow && peakWindow !== bestWindow ? peakWindow : undefined,
    sourceNote,
  };
}

function planPanel() {
  const moveCard = document.querySelector<HTMLElement>(".command-center .next-move-card");
  return moveCard?.closest<HTMLElement>(".compact-panel") || null;
}

function addWindow(container: HTMLElement, label: string, value?: string) {
  if (!value) return;

  const item = document.createElement("div");
  item.className = "castlewatch-tomorrow-window";

  const caption = document.createElement("span");
  caption.textContent = label;
  const detail = document.createElement("strong");
  detail.textContent = value;

  item.append(caption, detail);
  container.appendChild(item);
}

function createCard(view: ForecastView) {
  const card = document.createElement("div");
  card.className = CARD_CLASS;

  const heading = document.createElement("div");
  heading.className = "castlewatch-day-trend-heading";

  const titleGroup = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "muted";
  eyebrow.textContent = "Next-day planning";
  const title = document.createElement("h3");
  title.className = "castlewatch-day-trend-label";
  title.textContent = view.title;
  titleGroup.append(eyebrow, title);

  const confidence = document.createElement("span");
  confidence.className = "castlewatch-day-trend-pill";
  confidence.textContent = view.confidence;

  heading.append(titleGroup, confidence);
  card.appendChild(heading);

  const detail = document.createElement("p");
  detail.className = "muted";
  detail.textContent = view.detail;
  card.appendChild(detail);

  if (view.bestWindow || view.peakWindow) {
    const windows = document.createElement("div");
    windows.className = "castlewatch-tomorrow-windows";
    addWindow(windows, "Best historical window", view.bestWindow);
    addWindow(windows, "Highest-pressure window", view.peakWindow);
    card.appendChild(windows);
  }

  const source = document.createElement("p");
  source.className = "castlewatch-tomorrow-source";
  source.textContent = view.sourceNote;
  card.appendChild(source);

  return card;
}

function renderCard(view: ForecastView) {
  ensureStyle();

  const existing = document.querySelector(`.${CARD_CLASS}`);
  const panel = planPanel();
  if (!panel) {
    existing?.remove();
    return;
  }

  existing?.remove();
  const next = createCard(view);
  const source = panel.querySelector(".compact-source");
  if (source) source.insertAdjacentElement("beforebegin", next);
  else panel.appendChild(next);
}

export default function DayTrendLayer({ selectedPark }: { selectedPark: string }) {
  const [insights, setInsights] = useState<PlanningInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchPlanningInsights(selectedPark).then((result) => {
      if (cancelled) return;
      setInsights(result.ok && result.data ? result.data : null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedPark]);

  const view = useMemo(() => buildView(insights, loading), [insights, loading]);

  useEffect(() => {
    let timeout: number | null = null;

    function scheduleRender() {
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => renderCard(view), 120);
    }

    scheduleRender();
    document.addEventListener("click", scheduleRender, { passive: true });
    document.addEventListener("touchend", scheduleRender, { passive: true });

    return () => {
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("click", scheduleRender);
      document.removeEventListener("touchend", scheduleRender);
      document.querySelector(`.${CARD_CLASS}`)?.remove();
    };
  }, [view]);

  return null;
}
