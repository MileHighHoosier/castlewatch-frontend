"use client";

import { useEffect, useState } from "react";
import { loadFamilyDeviceAccess } from "../lib/familyTripDevices";
import { loadFamilyKey, loadFamilySyncMetadata } from "../lib/familyTripSync";

const STYLE_ID = "castlewatch-family-device-credential-diagnostic-style";

type CredentialState = {
  hasFamilyKey: boolean;
  hasProtectedDeviceMetadata: boolean;
  syncedVersion: number | null;
  syncedAt: string | null;
};

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .family-device-credential-diagnostic { border:1px solid rgba(255,184,76,.36); border-radius:14px; padding:11px 12px; margin:-4px 0 14px; background:rgba(255,184,76,.075); }
    .family-device-credential-diagnostic strong { display:block; margin-bottom:4px; }
    .family-device-credential-diagnostic span { display:block; color:var(--muted); font-size:11px; line-height:1.45; }
    .family-device-credential-diagnostic small { display:block; color:var(--muted); font-size:9px; line-height:1.4; margin-top:7px; }
  `;
  document.head.appendChild(style);
}

function readCredentialState(): CredentialState {
  const metadata = loadFamilySyncMetadata();
  return {
    hasFamilyKey: Boolean(loadFamilyKey().trim()),
    hasProtectedDeviceMetadata: Boolean(loadFamilyDeviceAccess()),
    syncedVersion: metadata?.version ?? null,
    syncedAt: metadata?.syncedAt ?? null,
  };
}

export default function FamilyTripDeviceCredentialDiagnostic() {
  const [state, setState] = useState<CredentialState>(() => ({
    hasFamilyKey: false,
    hasProtectedDeviceMetadata: false,
    syncedVersion: null,
    syncedAt: null,
  }));

  useEffect(() => {
    ensureStyle();

    function refresh() {
      setState(readCredentialState());
    }

    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  if (!state.syncedVersion || state.hasFamilyKey || state.hasProtectedDeviceMetadata) return null;

  const syncedAt = state.syncedAt ? new Date(state.syncedAt).toLocaleString() : null;

  return (
    <div className="family-device-credential-diagnostic">
      <strong>Device management needs a credential</strong>
      <span>
        This browser has a synchronized shared-plan baseline, but Family devices does not have the family key or protected-device metadata available. Shared-plan data may still look up to date from the last sync, but device management needs explicit family-key recovery or an accepted device invite.
      </span>
      <small>
        Last shared-plan baseline: version {state.syncedVersion}{syncedAt ? ` · ${syncedAt}` : ""}.
      </small>
    </div>
  );
}
