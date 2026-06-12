"use client";

import { useEffect, useState } from "react";
import { fetchRideData } from "../lib/api";

const STYLE_ID = "castlewatch-character-layer-style";
const CHARACTERS_TAB_CLASS = "castlewatch-characters-tab";
const CHARACTERS_PANEL_CLASS = "castlewatch-characters-panel";

const TRUE_CHARACTER_EXPERIENCE_KEYWORDS = [
  "adventurers outpost",
  "celebrity spotlight",
  "character landing",
  "character meet",
  "character greeting",
  "fairytale hall",
  "greeting",
  "meet ",
  "meet-",
  "meet and greet",
  "meet disney",
  "princess fairytale hall",
  "royal sommerhus",
  "star wars launch bay",
  "town square theater",
];

const CHARACTER_ACTIVITY_KEYWORDS = [
  "enchanted tales with belle",
];

const CHARACTER_FALSE_POSITIVES = [
  "a pirate's adventure",
  "buzz lightyear",
  "cinderella castle",
  "figment",
  "journey into imagination",
  "mickey & minnie's runaway railway",
  "mickey and minnie's runaway railway",
  "mickey's philharmagic",
  "monsters inc. laugh floor",
  "peter pan's flight",
  "the many adventures of winnie the pooh",
  "tiana's bayou adventure",
  "winnie the pooh",
];

type CharacterItem = {
  id?: string | number;
  name: string;
  park: string;
  land: string;
  wait: number;
  isOpen?: boolean;
  updated?: string;
};

function ensureCharacterStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${CHARACTERS_PANEL_CLASS} {
      margin-top: 0;
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
      display: flex;
      justify-content: space-between;
      gap: 10px;
    }

    .castlewatch-character-card strong {
      display: block;
      font-size: 17px;
      line-height: 1.12;
      margin-bottom: 6px;
    }

    .castlewatch-character-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 6px 0;
    }

    .castlewatch-character-badge {
      border: 1px solid rgba(143, 202, 255, 0.42);
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 12px;
      font-weight: 900;
      background: rgba(143, 202, 255, 0.10);
      color: var(--text);
      white-space: nowrap;
    }

    .castlewatch-character-pill {
      align-self: flex-start;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 999px;
      padding: 7px 10px;
      font-size: 13px;
      font-weight: 900;
      background: rgba(255,255,255,0.08);
      white-space: nowrap;
    }

    .castlewatch-character-hidden {
      display: none !important;
    }

    @media (max-width: 420px) {
      .castlewatch-character-card {
        flex-direction: column;
      }
    }
  `;
  document.head.appendChild(style);
}

function normalizeParkName(value?: string) {
  if (!value) return "Unknown Park";
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("magic kingdom")) return "Magic Kingdom";
  if (normalized.includes("epcot")) return "Epcot";
  if (normalized.includes("hollywood")) return "Hollywood Studios";
  if (normalized.includes("animal kingdom")) return "Animal Kingdom";
  return value.trim() || "Unknown Park";
}

function normalizedText(value: string) {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(value: string, keywords: string[]) {
  const normalized = normalizedText(value);
  return keywords.some((keyword) => normalized.includes(normalizedText(keyword)));
}

function isCharacterText(value: string) {
  const normalized = normalizedText(value);
  if (includesAny(normalized, CHARACTER_FALSE_POSITIVES)) return false;
  return includesAny(normalized, TRUE_CHARACTER_EXPERIENCE_KEYWORDS) || includesAny(normalized, CHARACTER_ACTIVITY_KEYWORDS);
}

function isCharacterItem(item: CharacterItem) {
  return isCharacterText(`${item.name} ${item.land}`);
}

function formatDateTime(value?: string) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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

function setExistingTabsInactive() {
  document.querySelectorAll<HTMLElement>(".section-tab").forEach((tab) => tab.classList.remove("section-tab-active"));
}

function showOriginalPanel() {
  document.querySelector(`.${CHARACTERS_PANEL_CLASS}`)?.classList.add("castlewatch-character-hidden");
  activeContentPanel()?.classList.remove("castlewatch-character-hidden");
}

function showCharactersPanel() {
  activeContentPanel()?.classList.add("castlewatch-character-hidden");
  document.querySelector(`.${CHARACTERS_PANEL_CLASS}`)?.classList.remove("castlewatch-character-hidden");
}

function createCharactersPanel(characters: CharacterItem[], selectedPark: string) {
  const panel = document.createElement("div");
  panel.className = `compact-panel ${CHARACTERS_PANEL_CLASS}`;

  const title = document.createElement("h3");
  title.textContent = "Characters & meet-and-greets";
  panel.appendChild(title);

  const intro = document.createElement("p");
  intro.className = "muted";
  intro.textContent = "Character greetings, princess moments, and meet-style experiences separated from general activities.";
  panel.appendChild(intro);

  if (!characters.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = `No true meet-and-greet entries found for ${selectedPark} yet. Character-themed rides and landmarks are intentionally excluded. Check the official app for exact character appearance times.`;
    panel.appendChild(empty);
    return panel;
  }

  const list = document.createElement("div");
  list.className = "castlewatch-character-list";

  characters.slice(0, 12).forEach((character) => {
    const card = document.createElement("div");
    card.className = "castlewatch-character-card";

    const body = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = character.name;
    body.appendChild(name);

    const badges = document.createElement("div");
    badges.className = "castlewatch-character-badges";

    const badgeTexts = ["Character", character.wait >= 0 && character.wait <= 15 ? "Low wait" : null, character.isOpen === false ? "Check later" : "Check timing"]
      .filter(Boolean) as string[];

    badgeTexts.forEach((text) => {
      const badge = document.createElement("span");
      badge.className = "castlewatch-character-badge";
      badge.textContent = text;
      badges.appendChild(badge);
    });
    body.appendChild(badges);

    const detail = document.createElement("p");
    detail.className = "muted";
    detail.textContent = `${character.land} · ${character.isOpen === false ? "Closed" : "Available/verify"} · ${formatDateTime(character.updated)}`;
    body.appendChild(detail);

    const pill = document.createElement("div");
    pill.className = "castlewatch-character-pill";
    pill.textContent = character.wait >= 0 ? `${character.wait} min` : "Character";

    card.appendChild(body);
    card.appendChild(pill);
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
    if (isCharacterText(text)) {
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

function renderCharactersLayer(characters: CharacterItem[], selectedPark: string, active: boolean, setActive: (value: boolean) => void) {
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
  const panel = createCharactersPanel(characters, selectedPark);
  const center = commandCenter();
  const source = center?.querySelector(".compact-source");
  if (source) source.insertAdjacentElement("beforebegin", panel);
  else center?.appendChild(panel);

  removeCharacterCardsFromActivities();

  if (active) {
    setExistingTabsInactive();
    tab.classList.add("section-tab-active");
    showCharactersPanel();
  } else {
    tab.classList.remove("section-tab-active");
    panel.classList.add("castlewatch-character-hidden");
  }
}

export default function CharacterMeetLayer({ selectedPark }: { selectedPark: string }) {
  const [characters, setCharacters] = useState<CharacterItem[]>([]);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadCharacters() {
      const result = await fetchRideData();
      if (cancelled) return;

      const rows = Array.isArray(result.data) ? result.data : [];
      const items: CharacterItem[] = rows.map((row: any, index: number) => ({
        id: row.id || `${row.name || row.ride_name || row.attraction || "character"}-${index}`,
        name: row.name || row.ride_name || row.attraction || `Character ${index + 1}`,
        park: normalizeParkName(row.park),
        land: row.land || "Character location",
        wait: typeof row.wait_time === "number" ? row.wait_time : typeof row.wait === "number" ? row.wait : -1,
        isOpen: row.is_open,
        updated: row.created_at,
      }));

      setCharacters(items
        .filter((item) => item.park === selectedPark)
        .filter(isCharacterItem)
        .sort((a, b) => (a.isOpen === false ? 1 : 0) - (b.isOpen === false ? 1 : 0) || Math.max(a.wait, 0) - Math.max(b.wait, 0) || a.name.localeCompare(b.name)));
    }

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
        showOriginalPanel();
      }

      if (renderTimeout) window.clearTimeout(renderTimeout);
      renderTimeout = window.setTimeout(() => renderCharactersLayer(characters, selectedPark, active, setActive), 120);
    }

    scheduleRender();
    document.addEventListener("click", scheduleRender, { passive: true });
    document.addEventListener("touchend", scheduleRender, { passive: true });

    return () => {
      if (renderTimeout) window.clearTimeout(renderTimeout);
      document.removeEventListener("click", scheduleRender);
      document.removeEventListener("touchend", scheduleRender);
      document.querySelector(`.${CHARACTERS_PANEL_CLASS}`)?.remove();
      document.querySelector(`.${CHARACTERS_TAB_CLASS}`)?.remove();
    };
  }, [active, characters, selectedPark]);

  return null;
}
