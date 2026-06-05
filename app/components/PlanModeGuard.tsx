"use client";

import { useEffect } from "react";
import { fetchRideData } from "../lib/api";

const COOL_DOWN_ONLY_RECOMMENDATIONS = ["carousel of progress", "use carousel only", "monsters inc", "laugh floor"];
const PLAN_EXCLUDED_KEYWORDS = [
  "carousel of progress",
  "main street vehicles",
  "single rider",
  "cinderella castle",
  "casey jr",
  "country bear",
  "enchanted tales",
  "a pirate's adventure",
  "philharmagic",
  "philarmagic",
  "laugh floor",
  "tom sawyer island",
];
const HEADLINER_KEYWORDS = ["seven dwarfs", "tron", "big thunder", "jungle cruise", "space mountain", "tiana", "haunted mansion", "pirates"];
const STRONG_LOW_STRESS_KEYWORDS = ["haunted mansion", "pirates", "buzz lightyear", "small world", "dumbo", "under the sea", "winnie the pooh", "mad tea party", "barnstormer"];
const GENTLE_FILLER_KEYWORDS = ["prince charming", "regal carrousel", "carousel", "peoplemover", "magic carpets", "liberty square riverboat"];
const MODE_WAIT_LIMITS = { aggressive: 60, lowStress: 35 } as const;
const COMPLETED_STORAGE_KEY = "castlewatch.completedRides.v1";

type GuardMode = "aggressive" | "lowStress" | "coolDown" | "unknown";
type RawRide = {
  name?: string;
  ride_name?: string;
  attraction?: string;
  park?: string;
  land?: string;
  wait?: number;
  wait_time?: number;
  is_open?: boolean;
};

function activePlanMode(): GuardMode {
  const activeMode = document.querySelector(".plan-mode-active strong")?.textContent?.trim().toLowerCase() || "";
  if (activeMode.includes("cool")) return "coolDown";
  if (activeMode.includes("max")) return "aggressive";
  if (activeMode.includes("low")) return "lowStress";
  return "unknown";
}

function activeParkName() {
  return document.querySelector(".command-header h2")?.textContent?.trim() || "Magic Kingdom";
}

function normalizedName(ride: RawRide) {
  return String(ride.name || ride.ride_name || ride.attraction || "").trim();
}

function waitTime(ride: RawRide) {
  const wait = ride.wait_time ?? ride.wait;
  return typeof wait === "number" ? wait : -1;
}

function includesAny(value: string, keywords: string[]) {
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function isCoolDownOnly(title: string) {
  const normalized = title.toLowerCase();
  return COOL_DOWN_ONLY_RECOMMENDATIONS.some((name) => normalized.includes(name));
}

function isGentleFillerRide(ride: RawRide) {
  return includesAny(normalizedName(ride), GENTLE_FILLER_KEYWORDS);
}

function isStrongLowStressRide(ride: RawRide) {
  return includesAny(normalizedName(ride), STRONG_LOW_STRESS_KEYWORDS);
}

function getCompletedRides() {
  try {
    return new Set<string>(JSON.parse(window.localStorage.getItem(COMPLETED_STORAGE_KEY) || "[]"));
  } catch {
    return new Set<string>();
  }
}

function isEligiblePlanRide(ride: RawRide, park: string) {
  const name = normalizedName(ride);
  const combined = `${name} ${ride.land || ""}`;
  if (!name) return false;
  if (ride.is_open === false) return false;
  if (waitTime(ride) < 0) return false;
  if (String(ride.park || "").toLowerCase() !== park.toLowerCase()) return false;
  if (includesAny(combined, PLAN_EXCLUDED_KEYWORDS)) return false;
  if (getCompletedRides().has(name)) return false;
  return true;
}

function scoreCandidate(ride: RawRide, mode: "aggressive" | "lowStress") {
  const name = normalizedName(ride);
  const wait = waitTime(ride);
  const headliner = includesAny(name, HEADLINER_KEYWORDS);
  const gentleFiller = isGentleFillerRide(ride);
  const strongLowStress = isStrongLowStressRide(ride);
  const underCap = wait <= MODE_WAIT_LIMITS[mode];

  if (mode === "lowStress") {
    return (underCap ? 1000 : 200)
      - wait * 8
      + (strongLowStress ? 110 : 0)
      + (headliner ? -90 : 30)
      + (gentleFiller ? -140 : 0);
  }

  return (underCap ? 1000 : 200)
    - wait * 3
    + (headliner ? 140 : 20)
    + (gentleFiller ? -120 : 0);
}

async function findReplacementRide(mode: "aggressive" | "lowStress") {
  const result = await fetchRideData();
  const park = activeParkName();
  const rows = Array.isArray(result.data) ? result.data as RawRide[] : [];

  const candidates = rows
    .filter((ride) => isEligiblePlanRide(ride, park))
    .sort((a, b) => scoreCandidate(b, mode) - scoreCandidate(a, mode));

  return candidates[0] || null;
}

function setStartRouteActive() {
  const startButton = document.querySelector<HTMLButtonElement>(".next-move-actions .button:first-child");
  if (!startButton) return;

  startButton.disabled = false;
  startButton.textContent = "Start route";
  startButton.classList.remove("blocked-start-route");
  delete startButton.dataset.planGuardBlocked;
}

function replacementWhyChosen(ride: RawRide, mode: "aggressive" | "lowStress") {
  const wait = waitTime(ride);
  const label = mode === "aggressive" ? "Max rides" : "Low-stress";

  if (isGentleFillerRide(ride)) {
    return "Stronger low-stress rides were limited, so CastleWatch picked a gentle nearby option.";
  }

  if (mode === "lowStress" && isStrongLowStressRide(ride) && wait <= 15) {
    return "Chosen because it is a stronger low-stress ride with a short wait.";
  }

  if (mode === "lowStress" && wait <= 15) {
    return "Chosen because it is a short-wait family ride that keeps the day easier.";
  }

  if (mode === "aggressive" && includesAny(normalizedName(ride), HEADLINER_KEYWORDS)) {
    return "Chosen because it has strong ride value for the current wait.";
  }

  return `Chosen because it is the best eligible ${label} ride available right now.`;
}

function updateRouteStepsForRide(name: string, gentleFiller = false) {
  if (!name) return;

  const steps = document.querySelectorAll(".plan-step p");
  if (steps[0]) steps[0].textContent = gentleFiller ? `Use ${name} if nearby.` : `Go to ${name}.`;
  if (steps[1]) steps[1].textContent = "Refresh after ride.";
  if (steps[2]) steps[2].textContent = "Recalculate before moving on.";
}

function syncRouteStepsFromCurrentRecommendation() {
  const nextMoveCard = document.querySelector(".next-move-card");
  if (!nextMoveCard) return;

  const replaced = nextMoveCard.getAttribute("data-plan-guard-replaced") === "true";
  const title = nextMoveCard.querySelector("h3")?.textContent?.trim() || "";
  if (!replaced || !title || isCoolDownOnly(title)) return;

  const gentleFiller = includesAny(title, GENTLE_FILLER_KEYWORDS);
  updateRouteStepsForRide(title, gentleFiller);
}

function replacePlanCardWithRide(ride: RawRide, mode: "aggressive" | "lowStress", reasonPrefix = "") {
  const nextMoveCard = document.querySelector(".next-move-card");
  if (!nextMoveCard) return;

  const name = normalizedName(ride);
  const wait = waitTime(ride);
  const land = ride.land || "nearby area";
  const label = mode === "aggressive" ? "Max rides" : "Low-stress";
  const headliner = includesAny(name, HEADLINER_KEYWORDS);
  const gentleFiller = isGentleFillerRide(ride);
  const strongLowStress = isStrongLowStressRide(ride);

  nextMoveCard.classList.remove("plan-mode-guard-warning");
  nextMoveCard.setAttribute("data-plan-guard-replaced", "true");
  nextMoveCard.setAttribute("data-plan-guard-original-blocked", "true");
  document.querySelector(".plan-mode-guard-note")?.remove();
  setStartRouteActive();

  const subtitle = nextMoveCard.querySelector(".stat-label");
  if (subtitle) subtitle.textContent = gentleFiller ? `Nearby option · ${label}` : `Next move · ${label}`;

  const heading = nextMoveCard.querySelector("h3");
  if (heading) heading.textContent = name;

  const badges = Array.from(nextMoveCard.querySelectorAll(".recommendation-badge"));
  if (badges[0]) badges[0].textContent = label;
  if (badges[1]) badges[1].textContent = wait <= 15 ? "Low wait" : `${wait} min`;
  if (badges[2]) badges[2].textContent = gentleFiller ? "Gentle ride" : headliner ? "High-value ride" : "Family target";
  if (badges[3]) {
    if (gentleFiller) {
      badges[3].textContent = "Nearby filler";
    } else if (strongLowStress) {
      badges[3].textContent = "Stronger option";
    } else {
      badges[3].remove();
    }
  }

  const mutedParagraphs = nextMoveCard.querySelectorAll("p.muted");
  if (mutedParagraphs[0]) {
    mutedParagraphs[0].innerHTML = `<strong>Why chosen:</strong> ${reasonPrefix}${replacementWhyChosen(ride, mode)}`;
  }
  if (mutedParagraphs[1]) {
    mutedParagraphs[1].textContent = `${wait} min wait in ${land}. Recalculate before crossing the park.`;
  }

  updateRouteStepsForRide(name, gentleFiller);
}

function showNoReplacementFallback(mode: "aggressive" | "lowStress") {
  const nextMoveCard = document.querySelector(".next-move-card");
  if (!nextMoveCard) return;

  nextMoveCard.classList.add("plan-mode-guard-warning");
  const subtitle = nextMoveCard.querySelector(".stat-label");
  if (subtitle) subtitle.textContent = mode === "aggressive" ? "No eligible target · Max rides" : "No eligible target · Low-stress";

  const heading = nextMoveCard.querySelector("h3");
  if (heading) heading.textContent = "Use Rides or Heat instead";

  const mutedParagraphs = nextMoveCard.querySelectorAll("p.muted");
  if (mutedParagraphs[0]) {
    mutedParagraphs[0].innerHTML = "<strong>Why:</strong> No better eligible ride was found under this mode right now.";
  }
  if (mutedParagraphs[1]) {
    mutedParagraphs[1].textContent = "Open the Rides or Heat tab, or switch to Cool down if your family needs an A/C reset.";
  }
}

function guardPlanModeRecommendations() {
  const mode = activePlanMode();
  const nextMoveCard = document.querySelector(".next-move-card");
  if (!nextMoveCard) {
    setStartRouteActive();
    return;
  }

  const title = nextMoveCard.querySelector("h3")?.textContent?.trim() || "";
  const completedRides = getCompletedRides();
  const recommendationIsCompleted = Boolean(title && completedRides.has(title));

  if (mode === "coolDown" || mode === "unknown") {
    if (!recommendationIsCompleted) setStartRouteActive();
    return;
  }

  const shouldReplace = recommendationIsCompleted || isCoolDownOnly(title);

  if (!shouldReplace) {
    nextMoveCard.classList.remove("plan-mode-guard-warning");
    document.querySelector(".plan-mode-guard-note")?.remove();
    setStartRouteActive();
    syncRouteStepsFromCurrentRecommendation();
    return;
  }

  if (nextMoveCard.getAttribute("data-plan-guard-loading") === "true") {
    syncRouteStepsFromCurrentRecommendation();
    return;
  }
  nextMoveCard.setAttribute("data-plan-guard-loading", "true");

  findReplacementRide(mode).then((replacement) => {
    if (replacement) {
      replacePlanCardWithRide(replacement, mode, recommendationIsCompleted ? "Completed ride skipped. " : "");
    } else {
      showNoReplacementFallback(mode);
    }
  }).finally(() => {
    nextMoveCard.removeAttribute("data-plan-guard-loading");
    syncRouteStepsFromCurrentRecommendation();
  });
}

export default function PlanModeGuard() {
  useEffect(() => {
    let intervalId: number | null = null;
    let delayedGuardTimeout: number | null = null;

    function scheduleGuard() {
      guardPlanModeRecommendations();

      if (delayedGuardTimeout) window.clearTimeout(delayedGuardTimeout);
      delayedGuardTimeout = window.setTimeout(guardPlanModeRecommendations, 260);

      if (intervalId) window.clearInterval(intervalId);
      let runs = 0;
      intervalId = window.setInterval(() => {
        guardPlanModeRecommendations();
        runs += 1;

        if (runs >= 12 && intervalId) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }, 200);
    }

    scheduleGuard();
    document.addEventListener("click", scheduleGuard, { passive: true });
    document.addEventListener("touchend", scheduleGuard, { passive: true });
    window.addEventListener("castlewatch:completed-rides-cleared", scheduleGuard);

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      if (delayedGuardTimeout) window.clearTimeout(delayedGuardTimeout);
      document.removeEventListener("click", scheduleGuard);
      document.removeEventListener("touchend", scheduleGuard);
      window.removeEventListener("castlewatch:completed-rides-cleared", scheduleGuard);
    };
  }, []);

  return null;
}
