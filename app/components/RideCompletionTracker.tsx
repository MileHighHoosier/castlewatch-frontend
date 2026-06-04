"use client";

import { useEffect } from "react";

const STORAGE_KEY = "castlewatch.completedRides.v1";

function getCompletedRides() {
  try {
    return new Set<string>(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set<string>();
  }
}

function saveCompletedRides(completed: Set<string>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(completed)));
}

function getRideName(card: Element) {
  return card.querySelector("strong")?.textContent?.trim() || "";
}

function isRideDemandCard(card: Element) {
  if (!card.classList.contains("ride")) return false;
  if (card.classList.contains("ride-unknown")) return false;
  return Boolean(getRideName(card));
}

function applyCompletedState(card: Element, completed: Set<string>) {
  const rideName = getRideName(card);
  if (!rideName || !isRideDemandCard(card)) return;

  const existingButton = card.querySelector<HTMLButtonElement>(".complete-ride-button");
  const isCompleted = completed.has(rideName);

  card.classList.toggle("ride-completed", isCompleted);
  card.setAttribute("data-completed", isCompleted ? "true" : "false");

  if (existingButton) {
    existingButton.textContent = isCompleted ? "Done ✓" : "Done";
    existingButton.setAttribute("aria-pressed", isCompleted ? "true" : "false");
    existingButton.classList.toggle("complete-ride-button-done", isCompleted);
  }
}

function enhanceRideCards() {
  const completed = getCompletedRides();

  document.querySelectorAll(".ride").forEach((card) => {
    if (!isRideDemandCard(card)) return;

    if (!card.querySelector(".complete-ride-button")) {
      const rideName = getRideName(card);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "complete-ride-button";
      button.textContent = completed.has(rideName) ? "Done ✓" : "Done";
      button.setAttribute("aria-label", `Mark ${rideName} complete`);
      button.setAttribute("aria-pressed", completed.has(rideName) ? "true" : "false");

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const nextCompleted = getCompletedRides();
        if (nextCompleted.has(rideName)) {
          nextCompleted.delete(rideName);
        } else {
          nextCompleted.add(rideName);
        }

        saveCompletedRides(nextCompleted);
        document.querySelectorAll(".ride").forEach((nextCard) => applyCompletedState(nextCard, nextCompleted));
      });

      card.appendChild(button);
    }

    applyCompletedState(card, completed);
  });
}

export default function RideCompletionTracker() {
  useEffect(() => {
    let intervalId: number | null = null;

    function scheduleEnhance() {
      enhanceRideCards();

      if (intervalId) window.clearInterval(intervalId);
      let runs = 0;
      intervalId = window.setInterval(() => {
        enhanceRideCards();
        runs += 1;

        if (runs >= 8 && intervalId) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }, 200);
    }

    scheduleEnhance();
    document.addEventListener("click", scheduleEnhance, { passive: true });
    document.addEventListener("touchend", scheduleEnhance, { passive: true });

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener("click", scheduleEnhance);
      document.removeEventListener("touchend", scheduleEnhance);
    };
  }, []);

  return null;
}
