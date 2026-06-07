"use client";

import { useEffect } from "react";

const STORAGE_KEY = "castlewatch.emergencyBreakMode.v1";

const PARK_BREAK_PLANS: Record<string, { title: string; reason: string; steps: string[]; note: string }> = {
  "magic kingdom": {
    title: "Exit to Main Street or the resort loop",
    reason: "Emergency break mode stops ride-pushing and prioritizes shade, bathrooms, water, stroller reset, transportation, or leaving the park.",
    steps: [
      "Stop the current ride plan and move toward Main Street, first aid, bathrooms, or the park exit.",
      "Give everyone water, shade, and a 10-minute no-decision reset.",
      "If the family is still melting down, leave for the resort and recalculate after rest.",
    ],
    note: "Best nearby exits: Main Street, monorail, ferry, bus loop, or resort boat depending on where you are.",
  },
  epcot: {
    title: "Move to indoor A/C or exit through the nearest gate",
    reason: "Emergency break mode favors indoor reset space and leaving the park over chasing low waits.",
    steps: [
      "Stop the current ride plan and move to the nearest indoor A/C area or restroom.",
      "Choose the closest exit path: front entrance, International Gateway, Skyliner, boat, or walking path.",
      "Recalculate only after the group has cooled down and eaten or rested.",
    ],
    note: "World Showcase can be a long walk. Do not cross the park unless it is clearly the shortest exit route.",
  },
  "hollywood studios": {
    title: "Exit toward the front, Skyliner, bus, or boat",
    reason: "Emergency break mode avoids long walking loops and keeps the next move simple.",
    steps: [
      "Stop the current ride plan and move toward the nearest restroom, shade, or the front of the park.",
      "Use Skyliner, bus, boat, or walking path depending on your resort and energy level.",
      "Do not chase another reservation until everyone is regulated again.",
    ],
    note: "Hollywood Studios feels hotter when crowded. A clean exit is usually better than one more short wait.",
  },
  "animal kingdom": {
    title: "Find shade first, then exit if needed",
    reason: "Emergency break mode treats heat and walking distance as the main problem, not wait times.",
    steps: [
      "Stop the current ride plan and move to shade, A/C, bathrooms, or first aid.",
      "If the group is still overwhelmed, leave through the front and use bus transportation.",
      "Recalculate later only if the family is physically and emotionally reset.",
    ],
    note: "Animal Kingdom paths can feel long and hot. Avoid crossing lands unless it clearly helps you exit faster.",
  },
};

function activeParkName() {
  return document.querySelector(".command-header h2")?.textContent?.trim() || "Magic Kingdom";
}

function isEmergencyActive() {
  return window.localStorage.getItem(STORAGE_KEY) === "on";
}

function setEmergencyActive(active: boolean) {
  window.localStorage.setItem(STORAGE_KEY, active ? "on" : "off");
}

function styleButton(button: HTMLButtonElement, active: boolean) {
  button.style.border = active ? "1px solid rgba(255, 204, 102, 0.75)" : "1px solid rgba(255, 204, 102, 0.45)";
  button.style.borderRadius = "16px";
  button.style.padding = "10px 8px";
  button.style.minHeight = "82px";
  button.style.display = "grid";
  button.style.placeItems = "center";
  button.style.gap = "6px";
  button.style.background = active ? "rgba(255, 204, 102, 0.18)" : "rgba(255, 204, 102, 0.08)";
  button.style.color = "var(--text)";
  button.style.fontWeight = "900";
  button.style.cursor = "pointer";
  button.style.boxShadow = active ? "inset 0 -3px 0 var(--warn), 0 0 0 1px rgba(255, 204, 102, 0.28)" : "none";
}

function styleCard(card: HTMLElement) {
  card.style.border = "1px solid rgba(255, 204, 102, 0.58)";
  card.style.borderRadius = "20px";
  card.style.padding = "14px";
  card.style.background = "linear-gradient(135deg, rgba(255, 204, 102, 0.18), rgba(255, 255, 255, 0.04))";
}

function renderEmergencyBreakMode() {
  const planPanel = Array.from(document.querySelectorAll(".compact-panel")).find((panel) => panel.querySelector(".next-move-card"));
  const modeTabs = planPanel?.querySelector(".plan-mode-tabs");
  if (!planPanel || !modeTabs) return;

  planPanel.querySelector(".emergency-break-control")?.remove();
  planPanel.querySelector(".emergency-break-card")?.remove();
  planPanel.querySelectorAll<HTMLElement>(".next-move-card, .plan-steps").forEach((element) => {
    element.style.display = "";
  });

  const active = isEmergencyActive();
  const control = document.createElement("button");
  control.type = "button";
  control.className = "emergency-break-control";
  control.innerHTML = `<span style="font-size: 22px; line-height: 1;">🛟</span><strong style="font-size: 11px; line-height: 1.1;">Emergency break</strong>`;
  styleButton(control, active);
  control.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setEmergencyActive(!isEmergencyActive());
    renderEmergencyBreakMode();
  });
  modeTabs.appendChild(control);

  if (!active) return;

  planPanel.querySelectorAll<HTMLElement>(".next-move-card, .plan-steps").forEach((element) => {
    element.style.display = "none";
  });

  const park = activeParkName().toLowerCase();
  const plan = PARK_BREAK_PLANS[park] || PARK_BREAK_PLANS["magic kingdom"];
  const card = document.createElement("div");
  card.className = "emergency-break-card";
  styleCard(card);
  card.innerHTML = `
    <span class="stat-label">Emergency break · leave-park mode</span>
    <h3 style="font-size: 24px; line-height: 1.05; margin: 0 0 10px;">${plan.title}</h3>
    <div class="badge-row">
      <span class="recommendation-badge">Stop ride plan</span>
      <span class="recommendation-badge">A/C or shade</span>
      <span class="recommendation-badge">Water reset</span>
      <span class="recommendation-badge">Exit OK</span>
    </div>
    <p class="muted"><strong>Why chosen:</strong> ${plan.reason}</p>
    <div class="history-summary"><strong>Family rule:</strong> This mode is for meltdown, heat, exhaustion, bathroom urgency, or a parent needing the day to stop escalating.</div>
    <div class="next-move-actions">
      <button class="button secondary-button emergency-break-exit" type="button">Exit emergency mode</button>
    </div>
  `;

  const steps = document.createElement("div");
  steps.className = "plan-steps emergency-break-steps";
  steps.innerHTML = plan.steps.map((step, index) => `<div class="plan-step"><span>${index + 1}</span><p>${step}</p></div>`).join("")
    + `<div class="plan-note"><strong>Exit note:</strong> ${plan.note}</div>`;

  modeTabs.insertAdjacentElement("afterend", card);
  card.insertAdjacentElement("afterend", steps);
  card.querySelector<HTMLButtonElement>(".emergency-break-exit")?.addEventListener("click", () => {
    setEmergencyActive(false);
    renderEmergencyBreakMode();
  });
}

export default function EmergencyBreakMode() {
  useEffect(() => {
    let renderTimeout: number | null = null;

    function scheduleRender(event?: Event) {
      const target = event?.target as Element | null;
      if (target?.closest?.(".emergency-break-control, .emergency-break-card")) return;
      if (renderTimeout) window.clearTimeout(renderTimeout);
      renderTimeout = window.setTimeout(renderEmergencyBreakMode, 160);
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
