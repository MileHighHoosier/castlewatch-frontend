"use client";

import { useEffect } from "react";

export default function ActivityMetadataPolish() {
  useEffect(() => {
    let activeCleanup: number | null = null;

    function cleanOpenLabels() {
      document.querySelectorAll(".ride-unknown p.muted").forEach((node) => {
        if (!node.textContent?.includes(" · Open · ")) return;
        node.textContent = node.textContent.replace(" · Open · ", " · ");
      });
    }

    function scheduleClean() {
      cleanOpenLabels();

      if (activeCleanup) {
        window.clearInterval(activeCleanup);
      }

      let runs = 0;
      activeCleanup = window.setInterval(() => {
        cleanOpenLabels();
        runs += 1;

        if (runs >= 10 && activeCleanup) {
          window.clearInterval(activeCleanup);
          activeCleanup = null;
        }
      }, 150);
    }

    scheduleClean();
    document.addEventListener("click", scheduleClean, { passive: true });
    document.addEventListener("touchend", scheduleClean, { passive: true });

    return () => {
      if (activeCleanup) window.clearInterval(activeCleanup);
      document.removeEventListener("click", scheduleClean);
      document.removeEventListener("touchend", scheduleClean);
    };
  }, []);

  return null;
}
