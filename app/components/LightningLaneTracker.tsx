"use client";

import { useEffect } from "react";

const STORAGE_KEY = "castlewatch.lightningLanes.v1";
const SAVED_CONFIRMATION_KEY = "castlewatch.lightningLaneSavedAt.v1";
const LL_CONFLICT_SOON_MINUTES = 60;
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

function markSavedConfirmation() {
  window.localStorage.setItem(SAVED_CONFIRMATION_KEY, String(Date.now()));
}

function shouldShowSavedConfirmation() {
  const savedAt = Number(window.localStorage.getItem(SAVED_CONFIRMATION_KEY) || 0);
  return savedAt > 0 && Date.now() - savedAt < 3500;
}

function clearSavedConfirmationSoon() {
  window.setTimeout(() => {
    window.localStorage.removeItem(SAVED_CONFIRMATION_KEY);
    renderLightningLaneTracker();
  }, 3000);
}

function minutesFromNow(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hours || 0, minutes || 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

function formatDisplayTime(time: string) {
  const [rawHours, rawMinutes] = time.split(":").map(Number);
  if (!Number.isFinite(rawHours) || !Number.isFinite(rawMinutes)) return time || "Time needed";

  const suffix = rawHours >= 12 ? "PM" : "AM";
  const hours = rawHours % 12 || 12;
  const minutes = String(rawMinutes).padStart(2, "0");
  return `${hours}:${minutes} ${suffix}`;
}

function formatWindow(start: string, end: string) {
  if (!start || !end) return "Window needed";
  return `${formatDisplayTime(start)}–${formatDisplayTime(end)}`;
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

function laneUrgencySortValue(lane: LightningLane) {
  const untilStart = minutesFromNow(lane.start);
  const untilEnd = minutesFromNow(lane.end);

  if (lane.used) return 300000 + untilStart;
  if (untilEnd < 0) return 200000 + Math.abs(untilEnd);
  if (untilStart <= 0 && untilEnd >= 0) return -100000 + untilEnd;
  return untilStart;
}

function sortLanesByUrgency(lanes: LightningLane[]) {
  return [...lanes].sort((a, b) => laneUrgencySortValue(a) - laneUrgencySortValue(b));
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

  return `Lightning Lane soon: ${lane.name} ${formatWindow(lane.start, lane.end)} starts in ${untilStart}m. Avoid crossing the park unless this Plan move still fits.`;
}

function nextSelectionHint(lanes: LightningLane[]) {
  const active = lanes.filter((lane) => !lane.used && statusForLane(lane) !== "Expired");
  if (!active.length) return "No active Lightning Lane windows. Add one when booked.";

  const current = active.find((lane) => statusForLane(lane) === "Use now");
  if (current) return `After tapping into ${current.name}, check for another selection.`;

  const next = sortLanesByUrgency(active)[0];
  return `Next window to watch: ${next.name} at ${formatDisplayTime(next.start)}.`;
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

function showPresetNextPrompt(form: HTMLFormElement) {
  form.querySelector(".lightning-lane-next-prompt")?.remove();

  const prompt = document.createElement("div");
  prompt.className = "lightning-lane-next-prompt";
  prompt.textContent = "Next: tap Start time";

  const startField = form.querySelector("input[name='start']")?.closest(".lightning-lane-field");
  if (startField) {
    startField.insertAdjacentElement("beforebegin", prompt);
  } else {
    form.appendChild(prompt);
  }

  window.setTimeout(() => {
    prompt.classList.add("lightning-lane-next-prompt-fading");
  }, 2400);

  window.setTimeout(() => {
    prompt.remove();
  }, 3000);
}

function updateAddReadyState(form: HTMLFormElement) {
  const name = String(new FormData(form).get("name") || "").trim();
  const start = String(new FormData(form).get("start") || "").trim();
  const end = String(new FormData(form).get("end") || "").trim();
  const addButton = form.querySelector<HTMLButtonElement>("button[type='submit']");
  if (!addButton) return;

  const ready = Boolean(name && start && end);
  addButton.classList.toggle("lightning-lane-add-ready", ready);
  addButton.textContent = ready ? "Add ready" : "Add";
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

  if (shouldShowSavedConfirmation()) {
    const savedNote = document.createElement("div");
    savedNote.className = "lightning-lane-saved-confirmation lightning-lane-next-prompt";
    savedNote.textContent = "Lightning Lane saved";
    form.prepend(savedNote);
    clearSavedConfirmationSoon();
  }

  const nameInput = form.querySelector<HTMLInputElement>("input[name='name']");
  form.addEventListener("input", () => updateAddReadyState(form));
  form.addEventListener("change", () => updateAddReadyState(form));

  form.querySelectorAll<HTMLButtonElement>("[data-ride-preset]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!nameInput) return;
      nameInput.value = button.dataset.ridePreset || "";
      nameInput.blur();
      updateAddReadyState(form);
      showPresetNextPrompt(form);
    });
  });

  updateAddReadyState(form);

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
    markSavedConfirmation();
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
    sortLanesByUrgency(lanes).forEach((lane) => {
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
