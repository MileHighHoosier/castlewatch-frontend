"use client";

import { useEffect, useState } from "react";
import {
  fetchCharacterMeets,
  isCharacterExperienceText,
  type CharacterMeet,
} from "../lib/api";

const STYLE_ID = "castlewatch-character-layer-style";
const CHARACTERS_TAB_CLASS = "castlewatch-characters-tab";
const CHARACTERS_PANEL_CLASS = "castlewatch-characters-panel";
const CHARACTERS_ACTIVE_CLASS = "castlewatch-characters-active";

function ensureCharacterStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${CHARACTERS_PANEL_CLASS} {
      margin-top: 0;
    }

    .section-tabs.${CHARACTERS_ACTIVE_CLASS} .section-tab.section-tab-active:not(.${CHARACTERS_TAB_CLASS}) {
      border-color: var(--line) !important;
      background: rgba(255, 255, 255, 0.05) !important;
      color: var(--muted) !important;
    }

    .castlewatch-character-list {
      display: grid;
      gap: 10px;
      margin-top: 12px;
    }

    .castlewatch-character-card {
      border: 1px solid rgba(102, 178, 255, 0.28);
      border-left: 7px solid rgba(255, 216, 102, 0.78);
      border-radius: 16px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.04);
    }

    .castlewatch-character-card strong {
      display: block;
      font-size: 17px;
      line-height: 1.12;
      margin-bottom: 6px;
    }

    .castlewatch-character-badges,
    .castlewatch-character-time-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 7px 0;
    }

    .castlewatch-character-badge,
    .castlewatch-character-time-pill {
      border: 1px solid rgba(143, 202, 255, 0.42);
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 12px;
      font-weight: 900;
      background: rgba(143, 202, 255, 0.10);
      color: var(--text);
      white-space: nowrap;
    }

    .castlewatch-character-time-pill {
      background: rgba(255, 216, 102, 0.10);
      border-color: rgba(255, 216, 102, 0.42);
    }

    .castlewatch-character-hidden {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

function formatShowTime(value?: string) {
  if (!value) return "Time TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function tabList() {
  return document.querySelector<HTMLElement>(".section-tabs");
}

function activeContentPanel() {
  return document.querySelector<HTMLElement>(".command-center .compact-panel:not(.castlewatch-characters-panel)");
}

function commandCenter() {
  return document.querySelector<HTMLElement>(".command-center");
}

function showOriginalPanel() {
  tabList()?.classList.remove(CHARACTERS_ACTIVE_CLASS);
  document.querySelector(`.${CHARACTERS_PANEL_CLASS}`)?.classList.add("castlewatch-character-hidden");
  activeContentPanel()?.classList.remove("castlewatch-character-hidden");
}

function showCharactersPanel() {
  activeContentPanel()?.classList.add("castlewatch-character-hidden");
  document.querySelector(`.${CHARACTERS_PANEL_CLASS}`)?.classList.remove("castlewatch-character-hidden");
}

function createBadge(text: string) {
  const badge = document.createElement("span");
  badge.className = "castlewatch-character-badge";
  badge.textContent = text;
  return badge;
}

function createCharactersPanel(characters: CharacterMeet[], selectedPark: string, error: string | null) {
  const panel = document.createElement("div");
  panel.className = `compact-panel ${CHARACTERS_PANEL_CLASS}`;

  const title = document.createElement("h3");
  title.textContent = "Characters & meet-and-greets";
  panel.appendChild(title);

  const intro = document.createElement("p");
  intro.className = "muted";
  intro.textContent = "True meet-and-greet locations separated from rides, shows, landmarks, and general activities.";
  panel.appendChild(intro);

  if (error) {
    const unavailable = document.createElement("p");
    unavailable.className = "muted";
    unavailable.textContent = "Character feed is not available yet. Check the official app for exact character appearance times.";
    panel.appendChild(unavailable);
    return panel;
  }

  if (!characters.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = `No true meet-and-greet entries found for ${selectedPark} right now. Character-themed rides and landmarks are intentionally excluded.`;
    panel.appendChild(empty);
    return panel;
  }

  const list = document.createElement("div");
  list.className = "castlewatch-character-list";

  characters.slice(0, 12).forEach((character) => {
    const card = document.createElement("div");
    card.className = "castlewatch-character-card";

    const name = document.createElement("strong");
    name.textContent = character.name;
    card.appendChild(name);

    const badges = document.createElement("div");
    badges.className = "castlewatch-character-badges";
    badges.appendChild(createBadge("Meet-and-greet"));
    if ((character.upcomingCount || 0) > 0) badges.appendChild(createBadge(`${character.upcomingCount} upcoming`));
    else badges.appendChild(createBadge("Verify timing"));
    card.appendChild(badges);

    const detail = document.createElement("p");
    detail.className = "muted";
    detail.textContent = `${character.land || "Character greeting"} · ${character.status || "Check official app"}`;
    card.appendChild(detail);

    const upcomingTimes = (character.times || []).filter((time) => !time.isPast).slice(0, 5);
    const timeRow = document.createElement("div");
    timeRow.className = "castlewatch-character-time-row";

    if (upcomingTimes.length) {
      upcomingTimes.forEach((time) => {
        const pill = document.createElement("span");
        pill.className = "castlewatch-character-time-pill";
        pill.textContent = formatShowTime(time.startTime);
        timeRow.appendChild(pill);
      });
    } else {
      const pill = document.createElement("span");
      pill.className = "castlewatch-character-time-pill";
      pill.textContent = "Check app";
      timeRow.appendChild(pill);
    }

    card.appendChild(timeRow);
    list.appendChild(card);
  });

  panel.appendChild(list);
  return panel;
}

function removeCharacterCardsFromActivities() {
  const panel = activityPanel();
  if (!panel) return;

  Array.from(panel.querySelectorAll<HTMLElement>(".ride")).forEach((card) => {
    const text = card.textContent || "";
    if (isCharacterExperienceText(text)) {
      card.classList.add("castlewatch-character-hidden");
    } else {
      card.classList.remove("castlewatch-character-hidden");
    }
  });
}

function activityPanel() {
  return Array.from(document.querySelectorAll<HTMLElement>(".compact-panel")).find((panel) => {
    const title = panel.querySelector("h3")?.textContent?.toLowerCase() || "";
    return title.includes("shows") && title.includes("activities");
  });
}

function renderCharactersLayer(characters: CharacterMeet[], selectedPark: string, active: boolean, error: string | null, setActive: (value: boolean) => void) {
  ensureCharacterStyle();

  const tabs = tabList();
  if (!tabs) return;

  let tab = tabs.querySelector<HTMLButtonElement>(`.${CHARACTERS_TAB_CLASS}`);
  if (!tab) {
    tab = document.createElement("button");
    tab.type = "button";
    tab.className = `section-tab ${CHARACTERS_TAB_CLASS}`;
    tab.textContent = "Characters";
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActive(true);
    });

    const activitiesTab = Array.from(tabs.querySelectorAll<HTMLElement>(".section-tab")).find((button) => button.textContent?.toLowerCase().includes("activities"));
    if (activitiesTab) activitiesTab.insertAdjacentElement("afterend", tab);
    else tabs.appendChild(tab);
  }

  document.querySelector(`.${CHARACTERS_PANEL_CLASS}`)?.remove();
  const panel = createCharactersPanel(characters, selectedPark, error);
  const center = commandCenter();
  const source = center?.querySelector(".compact-source");
  if (source) source.insertAdjacentElement("beforebegin", panel);
  else center?.appendChild(panel);

  removeCharacterCardsFromActivities();

  if (active) {
    tabs.classList.add(CHARACTERS_ACTIVE_CLASS);
    tab.classList.add("section-tab-active");
    showCharactersPanel();
  } else {
    tabs.classList.remove(CHARACTERS_ACTIVE_CLASS);
    tab.classList.remove("section-tab-active");
    panel.classList.add("castlewatch-character-hidden");
    window.requestAnimationFrame(showOriginalPanel);
  }
}

export default function CharacterMeetLayer({ selectedPark }: { selectedPark: string }) {
  const [characters, setCharacters] = useState<CharacterMeet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCharacters() {
      const result = await fetchCharacterMeets(selectedPark);
      if (cancelled) return;

      if (result.ok && result.data) {
        setCharacters(result.data.characters || []);
        setError(null);
      } else {
        setCharacters([]);
        setError(result.error || "Character feed unavailable");
      }
    }

    showOriginalPanel();
    setActive(false);
    loadCharacters();

    return () => {
      cancelled = true;
    };
  }, [selectedPark]);

  useEffect(() => {
    let renderTimeout: number | null = null;

    function scheduleRender(event?: Event) {
      const target = event?.target as Element | null;
      if (target?.closest?.(`.${CHARACTERS_TAB_CLASS}`)) return;

      if (active && target?.closest?.(".section-tab") && !target.closest(`.${CHARACTERS_TAB_CLASS}`)) {
        setActive(false);
      }

      if (renderTimeout) window.clearTimeout(renderTimeout);
      renderTimeout = window.setTimeout(() => renderCharactersLayer(characters, selectedPark, active, error, setActive), 120);
    }

    scheduleRender();
    document.addEventListener("click", scheduleRender, { passive: true });
    document.addEventListener("touchend", scheduleRender, { passive: true });

    return () => {
      if (renderTimeout) window.clearTimeout(renderTimeout);
      document.removeEventListener("click", scheduleRender);
      document.removeEventListener("touchend", scheduleRender);
    };
  }, [active, characters, error, selectedPark]);

  useEffect(() => {
    return () => {
      showOriginalPanel();
      document.querySelector(`.${CHARACTERS_PANEL_CLASS}`)?.remove();
      document.querySelector(`.${CHARACTERS_TAB_CLASS}`)?.remove();
    };
  }, []);

  return null;
}
