"use client";

import { useEffect } from "react";

const COOL_DOWN_ONLY_RECOMMENDATIONS = ["carousel of progress"];

function activePlanMode() {
  const activeMode = document.querySelector(".plan-mode-active strong")?.textContent?.trim().toLowerCase() || "";
  if (activeMode.includes("cool")) return "coolDown";
  if (activeMode.includes("max")) return "aggressive";
  if (activeMode.includes("low")) return "lowStress";
  return "unknown";
}

function isCoolDownOnly(title: string) {
  const normalized = title.toLowerCase();
  return COOL_DOWN_ONLY_RECOMMENDATIONS.some((name) => normalized.includes(name));
}

function guardPlanModeRecommendations() {
  const mode = activePlanMode();
  if (mode === "coolDown" || mode === "unknown") return;

  const nextMoveCard = document.querySelector(".next-move-card");
  if (!nextMoveCard) return;

  const title = nextMoveCard.querySelector("h3")?.textContent?.trim() || "";
  if (!isCoolDownOnly(title)) {
    nextMoveCard.classList.remove("plan-mode-guard-warning");
    document.querySelector(".plan-mode-guard-note")?.remove();
    return;
  }

  nextMoveCard.classList.add("plan-mode-guard-warning");

  const subtitle = nextMoveCard.querySelector(".stat-label");
  if (subtitle) subtitle.textContent = mode === "aggressive" ? "Blocked · Max rides" : "Blocked · Low-stress";

  const heading = nextMoveCard.querySelector("h3");
  if (heading) heading.textContent = "Use Carousel only for Cool down";

  const mutedParagraphs = nextMoveCard.querySelectorAll("p.muted");
  if (mutedParagraphs[0]) {
    mutedParagraphs[0].innerHTML = "<strong>Why blocked:</strong> Carousel of Progress is a seated A/C reset, not a main ride target for this mode.";
  }
  if (mutedParagraphs[1]) {
    mutedParagraphs[1].textContent = "Switch to Cool down for this option, or use Rides/Heat to choose a true ride-demand target.";
  }

  const steps = document.querySelectorAll(".plan-step p");
  if (steps[0]) steps[0].textContent = "Do not use Carousel as the main next move in this mode.";
  if (steps[1]) steps[1].textContent = "Switch to Cool down if the family needs an A/C break.";
  if (steps[2]) steps[2].textContent = "Use Rides or Heat for the next true ride target.";

  if (!document.querySelector(".plan-mode-guard-note")) {
    const note = document.createElement("div");
    note.className = "plan-note plan-mode-guard-note";
    note.innerHTML = "<strong>Mode rule:</strong> Carousel of Progress is reserved for Cool down / Activities, not Max rides or Low-stress.";
    nextMoveCard.insertAdjacentElement("afterend", note);
  }
}

export default function PlanModeGuard() {
  useEffect(() => {
    let intervalId: number | null = null;

    function scheduleGuard() {
      guardPlanModeRecommendations();

      if (intervalId) window.clearInterval(intervalId);
      let runs = 0;
      intervalId = window.setInterval(() => {
        guardPlanModeRecommendations();
        runs += 1;

        if (runs >= 8 && intervalId) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }, 200);
    }

    scheduleGuard();
    document.addEventListener("click", scheduleGuard, { passive: true });
    document.addEventListener("touchend", scheduleGuard, { passive: true });

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener("click", scheduleGuard);
      document.removeEventListener("touchend", scheduleGuard);
    };
  }, []);

  return null;
}
