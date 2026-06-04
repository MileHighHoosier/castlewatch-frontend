"use client";

import { useEffect } from "react";

export default function ActivityMetadataPolish() {
  useEffect(() => {
    function cleanOpenLabels() {
      document.querySelectorAll(".ride-unknown p.muted").forEach((node) => {
        if (!node.textContent?.includes(" · Open · ")) return;

        node.childNodes.forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE && child.textContent?.includes(" · Open · ")) {
            child.textContent = child.textContent.replace(" · Open · ", " · ");
          }
        });
      });
    }

    function scheduleClean() {
      window.setTimeout(cleanOpenLabels, 80);
      window.setTimeout(cleanOpenLabels, 350);
    }

    scheduleClean();
    document.addEventListener("click", scheduleClean, { passive: true });

    return () => document.removeEventListener("click", scheduleClean);
  }, []);

  return null;
}
