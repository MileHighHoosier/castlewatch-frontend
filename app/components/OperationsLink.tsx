"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FAMILY_AUTHORIZATION_UPDATED_EVENT,
  canViewFamilyTripOperations,
  loadFamilyTripAuthorization,
} from "../lib/familyTripAuthorization";

export default function OperationsLink() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    function refresh() {
      const authorization = loadFamilyTripAuthorization();
      setAvailable(Boolean(authorization && canViewFamilyTripOperations(authorization)));
    }
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(FAMILY_AUTHORIZATION_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(FAMILY_AUTHORIZATION_UPDATED_EVENT, refresh);
    };
  }, []);

  if (!available) return null;

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", margin: "-7px 0 14px" }}>
      <Link
        href="/operations"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View operations and cost in a new tab"
        style={{
          border: "1px solid rgba(142,197,255,.32)",
          borderRadius: 10,
          padding: "7px 10px",
          background: "rgba(142,197,255,.07)",
          color: "inherit",
          fontSize: 11,
          fontWeight: 900,
          textDecoration: "none",
        }}
      >
        View operations &amp; cost ↗
      </Link>
    </div>
  );
}
