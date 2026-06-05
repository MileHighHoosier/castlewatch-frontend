"use client";

import { useEffect } from "react";

const STORAGE_KEY = "castlewatch.lightningLanes.v1";

type LightningLane = {
  id: string;
  name: string;
  start: string;
  end: string;
  used: boolean;
};

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

function nextSelectionHint(lanes: LightningLane[]) {
  const active = lanes.filter((lane) => !lane.used && statusForLane(lane) !== "Expired");
  if (!active.length) return "No active Lightning Lane windows. Add one when booked.";

  const current = active.find((lane) => statusForLane(lane) === "Use now");
  if (current) return `After tapping into ${current.name}, check for another selection.`;

  const next = [...active].sort((a, b) => minutesFromNow(a.start) - minutesFromNow(b.start))[0];
  return `Next window to watch: ${next.name} at ${next.start}.`;
}

function renderLightningLaneTracker() {
  const planPanel = Array.from(document.querySelectorAll(".compact-panel")).find((panel) => panel.querySelector(".next-move-card"));
  if (!planPanel) return;

  planPanel.querySelector(".lightning-lane-tracker")?.remove();

  const lanes = readLanes();
  const tracker = document.createElement("section");
  tracker.className = "lightning-lane-tracker";

  const title = document.createElement("div");
  title.className = "lightning-lane-title";
  title.innerHTML = `<strong>Lightning Lane tracker</strong><span>${nextSelectionHint(lanes)}</span>`;

  const form = document.createElement("form");
  form.className = "lightning-lane-form";
  form.innerHTML = `
    <input name="name" aria-label="Ride name" placeholder="Ride" />
    <input name="start" aria-label="Start time" type="time" />
    <input name="end" aria-label="End time" type="time" />
    <button type="submit">Add</button>
  `;

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

  const nextMoveCard = planPanel.querySelector(".next-move-card");
  if (nextMoveCard) {
    nextMoveCard.insertAdjacentElement("afterend", tracker);
  } else {
    planPanel.appendChild(tracker);
  }
}

export default function LightningLaneTracker() {
  useEffect(() => {
    let intervalId: number | null = null;

    function scheduleRender() {
      renderLightningLaneTracker();

      if (intervalId) window.clearInterval(intervalId);
      let runs = 0;
      intervalId = window.setInterval(() => {
        renderLightningLaneTracker();
        runs += 1;

        if (runs >= 8 && intervalId) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }, 250);
    }

    scheduleRender();
    document.addEventListener("click", scheduleRender, { passive: true });
    document.addEventListener("touchend", scheduleRender, { passive: true });

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener("click", scheduleRender);
      document.removeEventListener("touchend", scheduleRender);
    };
  }, []);

  return null;
}
