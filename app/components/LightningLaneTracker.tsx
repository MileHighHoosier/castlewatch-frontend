"use client";

import { useEffect } from "react";

const STORAGE_KEY = "castlewatch.lightningLanes.v1";
const LL_CONFLICT_SOON_MINUTES = 45;
const PARK_RIDE_PRESETS: Record<string, string[]> = {
  "magic kingdom": [
    "Haunted Mansion",
    "Pirates",
    "Big Thunder",
    "Tiana",
    "TRON",
    "Seven Dwarfs",
  ],
  epcot: [
    "Remy",
    "Frozen",
    "Guardians",
    "Test Track",
    "Soarin'",
    "Spaceship Earth",
  ],
  "hollywood studios": [
    "Slinky Dog",
    "Rise of the Resistance",
    "Millennium Falcon",
    "Tower of Terror",
    "Rock 'n' Roller Coaster",
    "Mickey & Minnie's",
  ],
  "animal kingdom": [
    "Flight of Passage",
    "Na'vi River Journey",
    "Expedition Everest",
    "Kilimanjaro Safaris",
    "DINOSAUR",
    "Kali River Rapids",
  ],
};
const DEFAULT_RIDE_PRESETS = PARK_RIDE_PRESETS["magic kingdom"];

type LightningLane = {
  id: string;
  name: string;
  start: string;
  end: string;
  used: boolean;
};

function activeParkName() {
  return document.querySelector(".command-header h2")?.textContent?.trim() || "Magic Kingdom";
}

function ridePresetsForCurrentPark() {
  const park = activeParkName().toLowerCase();
  return PARK_RIDE_PRESETS[park] || DEFAULT_RIDE_PRESETS;
}

function readLanes(): LightningLane[] {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLanes(lanes: LightningLane[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lanes));
}

function minutesFromNow(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hours || 0, minutes || 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

function formatWindow(start: string, end: string) {
  if (!start || !end) return "Window needed";
  return `${start}–${end}`;
}

function statusForLane(lane: LightningLane) {
  if (lane.used) return "Used";

  const untilStart = minutesFromNow(lane.start);
  const untilEnd = minutesFromNow(lane.end);

  if (untilEnd < 0) return "Expired";
  if (untilStart <= 0 && untilEnd >= 0) return "Use now";
  if (untilStart <= 30) return `Soon · ${untilStart}m`;
  return `Later · ${untilStart}m`;
}

function activeConflictLane(lanes: LightningLane[]) {
  return lanes
    .filter((lane) => !lane.used && statusForLane(lane) !== "Expired")
    .map((lane) => ({ lane, untilStart: minutesFromNow(lane.start), untilEnd: minutesFromNow(lane.end) }))
    .filter(({ untilStart, untilEnd }) => untilEnd >= 0 && untilStart <= LL_CONFLICT_SOON_MINUTES)
    .sort((a, b) => a.untilStart - b.untilStart)[0] || null;
}

function conflictNoteText(lanes: LightningLane[]) {
  const conflict = activeConflictLane(lanes);
  if (!conflict) return "";

  const { lane, untilStart } = conflict;
  if (untilStart <= 0) {
    return `Lightning Lane active: ${lane.name} ${formatWindow(lane.start, lane.end)}. Check this before following the Plan move.`;
  }

  return `Lightning Lane soon: ${lane.name} starts in ${untilStart}m. Avoid crossing the park unless this Plan move still fits.`;
}

function nextSelectionHint(lanes: LightningLane[]) {
  const active = lanes.filter((lane) => !lane.used && statusForLane(lane) !== "Expired");
  if (!active.length) return "No active Lightning Lane windows. Add one when booked.";

  const current = active.find((lane) => statusForLane(lane) === "Use now");
  if (current) return `After tapping into ${current.name}, check for another selection.`;

  const next = [...active].sort((a, b) => minutesFromNow(a.start) - minutesFromNow(b.start))[0];
  return `Next window to watch: ${next.name} at ${next.start}.`;
}

function renderLightningLaneConflictNote(lanes: LightningLane[], planPanel: Element) {
  planPanel.querySelector(".lightning-lane-conflict-note")?.remove();

  const text = conflictNoteText(lanes);
  if (!text) return;

  const note = document.createElement("div");
  note.className = "plan-note lightning-lane-conflict-note";
  note.innerHTML = `<strong>LL check:</strong> ${text}`;

  const nextMoveCard = planPanel.querySelector(".next-move-card");
  if (nextMoveCard) {
    nextMoveCard.insertAdjacentElement("afterend", note);
  } else {
    planPanel.appendChild(note);
  }
}

function renderLightningLaneTracker() {
  const activeElement = document.activeElement;
  if (activeElement?.closest?.(".lightning-lane-tracker")) return;

  const planPanel = Array.from(document.querySelectorAll(".compact-panel")).find((panel) => panel.querySelector(".next-move-card"));
  if (!planPanel) return;

  planPanel.querySelector(".lightning-lane-tracker")?.remove();

  const lanes = readLanes();
  const ridePresets = ridePresetsForCurrentPark();
  renderLightningLaneConflictNote(lanes, planPanel);

  const tracker = document.createElement("section");
  tracker.className = "lightning-lane-tracker";

  const title = document.createElement("div");
  title.className = "lightning-lane-title";
  title.innerHTML = `<strong>Lightning Lane tracker</strong><span>${nextSelectionHint(lanes)}</span>`;

  const form = document.createElement("form");
  form.className = "lightning-lane-form";
  form.innerHTML = `
    <label class="lightning-lane-field lightning-lane-field-ride">
      <span>Ride</span>
      <input name="name" aria-label="Ride name" placeholder="Ride" />
    </label>
    <div class="lightning-lane-presets" aria-label="Ride presets">
      ${ridePresets.map((ride) => `<button type="button" data-ride-preset="${ride}">${ride}</button>`).join("")}
    </div>
    <label class="lightning-lane-field">
      <span>Start</span>
      <input name="start" aria-label="Start time" type="time" />
    </label>
    <label class="lightning-lane-field">
      <span>End</span>
      <input name="end" aria-label="End time" type="time" />
    </label>
    <button type="submit">Add</button>
  `;

  const nameInput = form.querySelector<HTMLInputElement>("input[name='name']");
  form.querySelectorAll<HTMLButtonElement>("[data-ride-preset]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!nameInput) return;
      nameInput.value = button.dataset.ridePreset || "";
      nameInput.blur();
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const start = String(data.get("start") || "").trim();
    const end = String(data.get("end") || "").trim();
    if (!name || !start || !end) return;

    saveLanes([
      ...readLanes(),
      { id: `${Date.now()}`, name, start, end, used: false },
    ]);
    renderLightningLaneTracker();
  });

  const list = document.createElement("div");
  list.className = "lightning-lane-list";

  if (!lanes.length) {
    const empty = document.createElement("p");
    empty.className = "lightning-lane-empty";
    empty.textContent = "Add return windows here so Plan can avoid conflicts.";
    list.appendChild(empty);
  } else {
    lanes.forEach((lane) => {
      const row = document.createElement("div");
      row.className = `lightning-lane-row ${lane.used ? "lightning-lane-used" : ""}`;

      const detail = document.createElement("div");
      detail.innerHTML = `<strong>${lane.name}</strong><span>${formatWindow(lane.start, lane.end)} · ${statusForLane(lane)}</span>`;

      const actions = document.createElement("div");
      actions.className = "lightning-lane-actions";

      const used = document.createElement("button");
      used.type = "button";
      used.textContent = lane.used ? "Undo" : "Used";
      used.addEventListener("click", () => {
        saveLanes(readLanes().map((nextLane) => nextLane.id === lane.id ? { ...nextLane, used: !nextLane.used } : nextLane));
        renderLightningLaneTracker();
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        saveLanes(readLanes().filter((nextLane) => nextLane.id !== lane.id));
        renderLightningLaneTracker();
      });

      actions.appendChild(used);
      actions.appendChild(remove);
      row.appendChild(detail);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  tracker.appendChild(title);
  tracker.appendChild(form);
  tracker.appendChild(list);

  const conflictNote = planPanel.querySelector(".lightning-lane-conflict-note");
  const nextMoveCard = planPanel.querySelector(".next-move-card");
  if (conflictNote) {
    conflictNote.insertAdjacentElement("afterend", tracker);
  } else if (nextMoveCard) {
    nextMoveCard.insertAdjacentElement("afterend", tracker);
  } else {
    planPanel.appendChild(tracker);
  }
}

export default function LightningLaneTracker() {
  useEffect(() => {
    let intervalId: number | null = null;
    let renderTimeout: number | null = null;

    function renderOnPlanOpen(event?: Event) {
      const target = event?.target as Element | null;
      if (target?.closest?.(".lightning-lane-tracker")) return;

      if (renderTimeout) window.clearTimeout(renderTimeout);
      renderTimeout = window.setTimeout(renderLightningLaneTracker, 180);
    }

    renderOnPlanOpen();
    intervalId = window.setInterval(renderLightningLaneTracker, 60000);

    document.addEventListener("click", renderOnPlanOpen, { passive: true });
    document.addEventListener("touchend", renderOnPlanOpen, { passive: true });
    window.addEventListener("castlewatch:completed-rides-cleared", renderOnPlanOpen);

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      if (renderTimeout) window.clearTimeout(renderTimeout);
      document.removeEventListener("click", renderOnPlanOpen);
      document.removeEventListener("touchend", renderOnPlanOpen);
      window.removeEventListener("castlewatch:completed-rides-cleared", renderOnPlanOpen);
    };
  }, []);

  return null;
}
