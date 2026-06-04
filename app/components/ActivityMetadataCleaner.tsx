"use client";

import { useEffect } from "react";

export default function ActivityMetadataCleaner() {
  useEffect(() => {
    function cleanActivityMetadata() {
      document.querySelectorAll(".ride-unknown p.muted").forEach((node) => {
        if (node.textContent?.includes(" · Open · ")) {
          node.childNodes.forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE && child.textContent) {
              child.textContent = child.textContent.replace(" · Open · ", " · ");
            }
          });
        }
      });
    }

    cleanActivityMetadata();

    const observer = new MutationObserver(cleanActivityMetadata);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
