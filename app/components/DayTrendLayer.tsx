"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchPlanningInsights } from "../lib/api";

const STYLE_ID = "castlewatch-day-trend-style";
const CARD_CLASS = "castlewatch-day-trend-card";

type RideTrend = {
  opportunity_score?: number;
  pressure_score?: number;
};

type PlanningInsights = {
  historical_entries_analyzed?: number;
  rides_analyzed?: number;
  best_now?: RideTrend[];
  unusually_high?: RideTrend[];
};

type TrendView = {
  label: string;
  detail: string;
  tone: "quiet" | "normal" | "busy" | "learning";
  confidence: string;
};

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${CARD_CLASS} {
      border: 1px solid rgba(142, 197, 255, 0.38);
      border-radius: 18px;
      padding: 12px;
      margin: 14px 0 8px;
      background: rgba(142, 197, 255, 0.08);
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
      border: 1px solid rgba(142, 197, 255, 0.34);
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 900;
      white-space: nowrap;
    }

    .castlewatch-day-trend-card[data-tone="quiet"] {
      border-color: rgba(56, 217, 150, 0.42);
      background: rgba(56, 217, 150, 0.08);
    }

    .castlewatch-day-trend-card[data-tone="busy"] {
      border-color: rgba(255, 204, 102, 0.45);
      background: rgba(255, 204, 102, 0.08);
    }
  `;
  document.head.appendChild(style);
}

function score(items: RideTrend[] | undefined, key: "opportunity_score" | "pressure_score") {
  return (items || []).reduce((sum, item) => sum + Math.max(Number(item[key] || 0), 0), 0);
}

function buildTrend(insights: PlanningInsights | null): TrendView {
  const samples = Number(insights?.historical_entries_analyzed || 0);
  const rides = Number(insights?.rides_analyzed || 0);
  const weekday = new Date().toLocaleDateString([], { weekday: "long" });

  if (samples < 40 || rides < 5) {
    return {
      label: `${weekday} trend is still learning`,
      detail: "CastleWatch needs more saved wait-time samples before calling today busier or quieter than normal.",
      tone: "learning",
      confidence: "Low confidence",
    };
  }

  const opportunity = score(insights?.best_now, "opportunity_score");
  const pressure = score(insights?.unusually_high, "pressure_score");
  const difference = opportunity - pressure;
  const confidence = samples >= 250 ? "Higher confidence" : samples >= 100 ? "Medium confidence" : "Early signal";

  if (difference >= 20) {
    return {
      label: `${weekday} looks quieter than typical`,
      detail: "More tracked attractions are running below their historical baseline than above it.",
      tone: "quiet",
      confidence,
    };
  }

  if (difference <= -20) {
    return {
      label: `${weekday} looks busier than typical`,
      detail: "More tracked attractions are running above their historical baseline than below it.",
      tone: "busy",
      confidence,
    };
  }

  return {
    label: `${weekday} is near the usual pattern`,
    detail: "Current waits are mixed and do not show a strong park-wide difference from the historical baseline.",
    tone: "normal",
    confidence,
  };
}

function planPanel() {
  const moveCard = document.querySelector<HTMLElement>(".command-center .next-move-card");
  return moveCard?.closest<HTMLElement>(".compact-panel") || null;
}

function createCard(view: TrendView) {
  const card = document.createElement("div");
  card.className = CARD_CLASS;
  card.dataset.tone = view.tone;

  const heading = document.createElement("div");
  heading.className = "castlewatch-day-trend-heading";

  const titleGroup = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "muted";
  eyebrow.textContent = "Today vs historical baseline";
  const title = document.createElement("h3");
  title.className = "castlewatch-day-trend-label";
  title.textContent = view.label;
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

  return card;
}

function renderCard(view: TrendView) {
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

  useEffect(() => {
    let cancelled = false;

    fetchPlanningInsights(selectedPark).then((result) => {
      if (cancelled) return;
      setInsights(result.ok && result.data ? result.data : null);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedPark]);

  const view = useMemo(() => buildTrend(insights), [insights]);

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
