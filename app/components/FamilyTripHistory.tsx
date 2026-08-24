"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FAMILY_AUTHORIZATION_UPDATED_EVENT,
  FamilyTripAuthorization,
  canRestoreFamilyTrip,
  familyTripAuthorizationDescription,
  loadFamilyTripAuthorization,
} from "../lib/familyTripAuthorization";
import {
  FamilyTripDocument,
  FamilyTripHistoryDocument,
  FamilyTripHistorySnapshot,
  FamilyTripSyncAnalysis,
  FamilyTripSyncError,
  analyzeFamilyTripSync,
  applyFamilyTripPayload,
  buildLocalFamilyTripPayload,
  createFamilySyncMetadata,
  fetchFamilyTrip,
  fetchFamilyTripHistory,
  fetchFamilyTripHistoryVersion,
  loadFamilySyncMetadata,
  restoreFamilyTripVersion,
  saveFamilySyncMetadata,
} from "../lib/familyTripSync";

const STYLE_ID = "castlewatch-family-history-style";

type CheckedState = {
  authorization: FamilyTripAuthorization;
  remote: FamilyTripDocument;
  analysis: FamilyTripSyncAnalysis;
  history: FamilyTripHistoryDocument;
};

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .family-history { border:1px solid rgba(99,164,255,.28); border-radius:16px; margin:-2px 0 14px; background:rgba(99,164,255,.035); overflow:hidden; }
    .family-history > summary { cursor:pointer; list-style:none; padding:12px 13px; display:flex; align-items:center; justify-content:space-between; gap:10px; font-weight:900; }
    .family-history > summary::-webkit-details-marker { display:none; }
    .family-history-count { border:1px solid rgba(99,164,255,.34); border-radius:999px; padding:4px 8px; font-size:10px; white-space:nowrap; color:rgb(157,199,255); }
    .family-history-content { padding:0 13px 13px; }
    .family-history-content > p { margin-top:0; }
    .family-history-list { display:grid; gap:8px; margin-top:10px; }
    .family-history-entry { border:1px solid rgba(255,255,255,.11); border-radius:12px; padding:10px; background:rgba(0,0,0,.09); }
    .family-history-entry-current { border-color:rgba(56,217,150,.38); background:rgba(56,217,150,.05); }
    .family-history-entry-top { display:flex; justify-content:space-between; gap:9px; align-items:flex-start; }
    .family-history-entry-title { font-weight:900; }
    .family-history-entry-meta { color:var(--muted); font-size:10px; line-height:1.45; margin-top:4px; }
    .family-history-current { border:1px solid rgba(56,217,150,.38); color:rgb(124,239,191); border-radius:999px; padding:3px 7px; font-size:9px; font-weight:900; white-space:nowrap; }
    .family-history-restore { border:1px solid rgba(255,184,76,.4); border-radius:9px; padding:7px 9px; margin-top:8px; background:rgba(255,184,76,.07); color:inherit; font:inherit; font-size:10px; font-weight:900; cursor:pointer; width:100%; }
    .family-history-restore:disabled { cursor:not-allowed; opacity:.52; }
    .family-history-refresh { border:1px solid rgba(255,255,255,.15); border-radius:9px; padding:8px 9px; margin-top:10px; background:rgba(255,255,255,.04); color:inherit; font:inherit; font-size:10px; font-weight:900; cursor:pointer; width:100%; }
    .family-history-message { border-radius:10px; padding:8px 9px; margin-top:9px; font-size:11px; line-height:1.4; }
    .family-history-error { border:1px solid rgba(255,99,99,.4); background:rgba(255,99,99,.07); }
    .family-history-success { border:1px solid rgba(56,217,150,.36); background:rgba(56,217,150,.06); }
    .family-history-warning { border:1px solid rgba(255,184,76,.38); background:rgba(255,184,76,.06); }
    .family-history-confirm { border:1px solid rgba(255,184,76,.4); border-radius:12px; padding:10px; margin-top:10px; background:rgba(255,184,76,.06); }
    .family-history-confirm strong { display:block; margin-bottom:5px; }
    .family-history-confirm-actions { display:grid; gap:7px; margin-top:10px; }
    .family-history-confirm-button { border:1px solid rgba(255,184,76,.45); border-radius:9px; padding:8px 9px; background:rgba(255,184,76,.09); color:inherit; font:inherit; font-size:10px; font-weight:900; cursor:pointer; }
    .family-history-cancel { border-color:rgba(255,255,255,.15); background:rgba(255,255,255,.04); }
  `;
  document.head.appendChild(style);
}

function displayDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Unknown time";
}

export default function FamilyTripHistory() {
  const [authorization, setAuthorization] = useState<FamilyTripAuthorization | null>(null);
  const [remote, setRemote] = useState<FamilyTripDocument | null>(null);
  const [history, setHistory] = useState<FamilyTripHistoryDocument | null>(null);
  const [analysis, setAnalysis] = useState<FamilyTripSyncAnalysis | null>(null);
  const [selected, setSelected] = useState<FamilyTripHistorySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFailure = useCallback((value: unknown) => {
    setError(value instanceof Error ? value.message : "Shared backup history could not be loaded.");
  }, []);

  const refresh = useCallback(async (announce = false): Promise<CheckedState | null> => {
    const selectedAuthorization = loadFamilyTripAuthorization();
    setAuthorization(selectedAuthorization);
    if (!selectedAuthorization) {
      setRemote(null);
      setHistory(null);
      setAnalysis(null);
      return null;
    }

    setLoading(true);
    try {
      const [current, nextHistory] = await Promise.all([
        fetchFamilyTrip(selectedAuthorization),
        fetchFamilyTripHistory(selectedAuthorization),
      ]);
      const nextAnalysis = analyzeFamilyTripSync(
        buildLocalFamilyTripPayload(),
        current,
        loadFamilySyncMetadata(),
      );
      setRemote(current);
      setHistory(nextHistory);
      setAnalysis(nextAnalysis);
      setError(null);
      if (announce) setSuccess(`Backup history refreshed through version ${current.version}.`);
      return { authorization: selectedAuthorization, remote: current, analysis: nextAnalysis, history: nextHistory };
    } catch (refreshError) {
      handleFailure(refreshError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [handleFailure]);

  useEffect(() => {
    ensureStyle();
    void refresh(false);

    function onFocus() {
      void refresh(false);
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onFocus);
    window.addEventListener(FAMILY_AUTHORIZATION_UPDATED_EVENT, onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onFocus);
      window.removeEventListener(FAMILY_AUTHORIZATION_UPDATED_EVENT, onFocus);
    };
  }, [refresh]);

  async function prepareRestore(version: number) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    setSelected(null);
    const checked = await refresh(false);
    if (!checked) {
      setBusy(false);
      return;
    }
    if (checked.analysis.id !== "up_to_date") {
      setError("Restore is blocked until this browser is up to date with no local changes. Resolve the sync status above first.");
      setBusy(false);
      return;
    }
    if (version === checked.remote.version) {
      setError("That version is already the current shared plan.");
      setBusy(false);
      return;
    }

    if (!canRestoreFamilyTrip(checked.authorization)) {
      setError("Viewer access can inspect backup history but cannot restore a shared version.");
      setBusy(false);
      return;
    }

    try {
      const snapshot = await fetchFamilyTripHistoryVersion(checked.authorization, version);
      setSelected(snapshot);
    } catch (snapshotError) {
      handleFailure(snapshotError);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRestore() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const selectedAuthorization = loadFamilyTripAuthorization();
      if (!selectedAuthorization) throw new Error("Reconnect the Shared Family Plan before restoring a backup.");
      if (!canRestoreFamilyTrip(selectedAuthorization)) {
        throw new Error("Viewer access cannot restore a shared version.");
      }

      const current = await fetchFamilyTrip(selectedAuthorization);
      const currentAnalysis = analyzeFamilyTripSync(
        buildLocalFamilyTripPayload(),
        current,
        loadFamilySyncMetadata(),
      );
      if (currentAnalysis.id !== "up_to_date") {
        throw new Error("Restore stopped because the sync state changed. Resolve the Shared Family Plan status and try again.");
      }

      const restored = await restoreFamilyTripVersion(selectedAuthorization, current.version, selected.version);
      if (!restored.payload) throw new Error("The restored shared version did not include a trip payload.");

      const nextMetadata = createFamilySyncMetadata(restored.version, restored.payload);
      saveFamilySyncMetadata(nextMetadata);
      applyFamilyTripPayload(restored.payload);
      window.location.reload();
    } catch (restoreError) {
      if (restoreError instanceof FamilyTripSyncError && restoreError.document) {
        setRemote(restoreError.document);
      }
      handleFailure(restoreError);
      setBusy(false);
    }
  }

  if (!authorization) return null;

  const roleCanRestore = canRestoreFamilyTrip(authorization);
  const canRestore = roleCanRestore && analysis?.id === "up_to_date";
  const entries = history?.entries || [];

  return (
    <details
      className="family-history"
      onToggle={(event) => {
        if (event.currentTarget.open) void refresh(false);
      }}
    >
      <summary>
        <span>Backup History &amp; Restore</span>
        <span className="family-history-count">{loading ? "Loading…" : `${entries.length} saved`}</span>
      </summary>
      <div className="family-history-content">
        <p className="muted">
          CastleWatch keeps up to {history?.historyLimit || 25} shared snapshots. Restoring never erases history—it creates a new shared version from the selected backup.
          {` Credential: ${familyTripAuthorizationDescription(authorization)}.`}
        </p>

        {!roleCanRestore && (
          <div className="family-history-message family-history-warning">
            Viewer access can inspect current and historical versions. Restore controls require an Owner or Editor credential.
          </div>
        )}

        {roleCanRestore && !canRestore && analysis && (
          <div className="family-history-message family-history-warning">
            Restore controls are locked while the Shared Family Plan says “{analysis.label}.” Resolve that status first.
          </div>
        )}

        {entries.length === 0 && !loading && (
          <div className="family-history-message family-history-warning">
            No backup snapshots are available yet. The current shared version will be recorded when Railway initializes history.
          </div>
        )}

        <div className="family-history-list">
          {entries.map((entry) => (
            <div
              className={`family-history-entry ${entry.isCurrent ? "family-history-entry-current" : ""}`}
              key={entry.version}
            >
              <div className="family-history-entry-top">
                <div>
                  <div className="family-history-entry-title">Shared version {entry.version}</div>
                  <div className="family-history-entry-meta">
                    {displayDate(entry.createdAt)} · {entry.reservationCount} reservation{entry.reservationCount === 1 ? "" : "s"} · {entry.activeScenario === "alternate" ? "Alternate" : "Base"} plan{entry.locked ? " · locked" : ""}
                    {entry.restoredFromVersion ? ` · restored from v${entry.restoredFromVersion}` : ""}
                  </div>
                </div>
                {entry.isCurrent && <span className="family-history-current">Current</span>}
              </div>
              {!entry.isCurrent && roleCanRestore && (
                <button
                  className="family-history-restore"
                  type="button"
                  disabled={busy || loading || !canRestore}
                  onClick={() => void prepareRestore(entry.version)}
                >
                  Preview restore of v{entry.version}
                </button>
              )}
            </div>
          ))}
        </div>

        {entries.length === 1 && entries[0]?.isCurrent && (
          <div className="family-history-message family-history-success">
            History is active. A previous-version restore option will appear after the next shared upload.
          </div>
        )}

        <button className="family-history-refresh" type="button" disabled={loading || busy} onClick={() => void refresh(true)}>
          {loading ? "Refreshing history…" : "Refresh backup history"}
        </button>

        {selected && remote && (
          <div className="family-history-confirm">
            <strong>Restore shared version {selected.version} as new version {remote.version + 1}?</strong>
            <div className="muted">
              Snapshot from {displayDate(selected.createdAt)}: {selected.summary.reservationCount} reservation{selected.summary.reservationCount === 1 ? "" : "s"}, {selected.summary.activeScenario === "alternate" ? "alternate" : "base"} plan{selected.summary.locked ? ", locked" : ""}. The current shared version remains in history, and this browser will reload with the restored plan.
            </div>
            <div className="family-history-confirm-actions">
              <button className="family-history-confirm-button" type="button" disabled={busy} onClick={() => void confirmRestore()}>
                {busy ? "Restoring…" : `Confirm restore of v${selected.version}`}
              </button>
              <button className="family-history-confirm-button family-history-cancel" type="button" disabled={busy} onClick={() => setSelected(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && <div className="family-history-message family-history-error">{error}</div>}
        {success && <div className="family-history-message family-history-success">{success}</div>}
      </div>
    </details>
  );
}
