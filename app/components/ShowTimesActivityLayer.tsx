"use client";

import { useEffect, useState } from "react";
import { fetchShowTimes, type ParkShow, type ShowTimesResult } from "../lib/api";

const STYLE_ID = "castlewatch-showtimes-activity-style";
const CARD_CLASS = "castlewatch-showtimes-card";

const CHARACTER_SHOW_KEYWORDS = [
  "adventurers outpost",
  "celebrity spotlight",
  "character landing",
  "character meet",
  "character greeting",
  "fairytale hall",
  "meet ",
  "meet-",
  "meet and greet",
  "meet disney",
  "princess fairytale hall",
  "royal sommerhus",
  "star wars launch bay",
  "town square theater",
];

function ensureShowTimesStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .castlewatch-showtimes-card {
      border: 1px solid rgba(102, 178, 255, 0.46);
      border-radius: 18px;
      padding: 12px;
      margin: 12px 0 14px;
      background: linear-gradient(135deg, rgba(102, 178, 255, 0.12), rgba(255, 255, 255, 0.04));
    }

    .castlewatch-showtimes-card h4 {
      margin: 0 0 6px;
      font-size: 18px;
      line-height: 1.1;
    }

    .castlewatch-showtimes-card p {
      margin: 0;
    }

    .castlewatch-show-card-list {
      display: grid;
      gap: 9px;
      margin-top: 10px;
    }

    .castlewatch-show-card {
      border: 1px solid rgba(102, 178, 255, 0.28);
      border-radius: 14px;
      padding: 10px;
      background: rgba(255, 255, 255, 0.04);
    }

    .castlewatch-show-card strong {
      display: block;
      font-size: 15px;
      line-height: 1.15;
      margin-bottom: 3px;
    }

    .castlewatch-show-time-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }

    .castlewatch-show-time-pill {
      border: 1px solid rgba(143, 202, 255, 0.42);
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 12px;
      font-weight: 900;
      color: var(--text);
      background: rgba(143, 202, 255, 0.10);
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isCharacterShow(show: ParkShow) {
  const combined = normalizeText(`${show.name} ${show.land || ""}`);
  return CHARACTER_SHOW_KEYWORDS.some((keyword) => combined.includes(normalizeText(keyword)));
}

function formatShowTime(value?: string) {
  if (!value) return "Time TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function activityPanel() {
  return Array.from(document.querySelectorAll<HTMLElement>(".compact-panel")).find((panel) => {
    const title = panel.querySelector("h3")?.textContent?.toLowerCase() || "";
    return title.includes("shows") && title.includes("activities");
  });
}

function createShowTimesCard(data: ShowTimesResult | null, loading: boolean, error: string | null) {
  const card = document.createElement("div");
  card.className = CARD_CLASS;

  const title = document.createElement("h4");
  title.textContent = "Today’s showtimes";
  card.appendChild(title);

  const summary = document.createElement("p");
  summary.className = "muted";

  if (loading) {
    summary.textContent = "Loading timed shows and entertainment...";
    card.appendChild(summary);
    return card;
  }

  if (error) {
    summary.textContent = "Showtime feed is not available yet. General activities are still listed below.";
    card.appendChild(summary);
    return card;
  }

  const shows = (data?.shows || [])
    .filter((show) => show.times?.length)
    .filter((show) => !isCharacterShow(show))
    .slice(0, 6);

  if (!shows.length) {
    summary.textContent = "No timed shows found right now. Check again after refresh or use the general activity list below.";
    card.appendChild(summary);
    return card;
  }

  summary.textContent = "Use these for A/C breaks, storm shelter, or low-stress reset windows.";
  card.appendChild(summary);

  const list = document.createElement("div");
  list.className = "castlewatch-show-card-list";

  shows.forEach((show: ParkShow) => {
    const item = document.createElement("div");
    item.className = "castlewatch-show-card";

    const name = document.createElement("strong");
    name.textContent = show.name;
    item.appendChild(name);

    const detail = document.createElement("p");
    detail.className = "muted";
    detail.textContent = `${show.land || "Entertainment"} · ${show.upcomingCount || 0} upcoming`;
    item.appendChild(detail);

    const row = document.createElement("div");
    row.className = "castlewatch-show-time-row";

    show.times
      .filter((time) => !time.isPast)
      .slice(0, 5)
      .forEach((time) => {
        const pill = document.createElement("span");
        pill.className = "castlewatch-show-time-pill";
        pill.textContent = formatShowTime(time.startTime);
        row.appendChild(pill);
      });

    if (!row.children.length) {
      const pill = document.createElement("span");
      pill.className = "castlewatch-show-time-pill";
      pill.textContent = "No upcoming times";
      row.appendChild(pill);
    }

    item.appendChild(row);
    list.appendChild(item);
  });

  card.appendChild(list);
  return card;
}

function renderShowTimesCard(data: ShowTimesResult | null, loading: boolean, error: string | null) {
  ensureShowTimesStyle();

  const existing = document.querySelector(`.${CARD_CLASS}`);
  const panel = activityPanel();

  if (!panel) {
    existing?.remove();
    return;
  }

  const nextCard = createShowTimesCard(data, loading, error);
  const intro = panel.querySelector("p.muted");

  if (existing) existing.replaceWith(nextCard);
  else (intro || panel.querySelector("h3") || panel).insertAdjacentElement("afterend", nextCard);
}

export default function ShowTimesActivityLayer({ selectedPark }: { selectedPark: string }) {
  const [data, setData] = useState<ShowTimesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadShowTimes() {
      setLoading(true);
      setError(null);
      const result = await fetchShowTimes(selectedPark);
      if (cancelled) return;

      if (result.ok && result.data) {
        setData(result.data);
        setError(null);
      } else {
        setData(null);
        setError(result.error || "Showtime feed unavailable");
      }
      setLoading(false);
    }

    loadShowTimes();

    return () => {
      cancelled = true;
    };
  }, [selectedPark]);

  useEffect(() => {
    let renderTimeout: number | null = null;

    function scheduleRender() {
      if (renderTimeout) window.clearTimeout(renderTimeout);
      renderTimeout = window.setTimeout(() => renderShowTimesCard(data, loading, error), 120);
    }

    scheduleRender();
    document.addEventListener("click", scheduleRender, { passive: true });
    document.addEventListener("touchend", scheduleRender, { passive: true });

    return () => {
      if (renderTimeout) window.clearTimeout(renderTimeout);
      document.removeEventListener("click", scheduleRender);
      document.removeEventListener("touchend", scheduleRender);
      document.querySelector(`.${CARD_CLASS}`)?.remove();
    };
  }, [data, loading, error]);

  return null;
}
