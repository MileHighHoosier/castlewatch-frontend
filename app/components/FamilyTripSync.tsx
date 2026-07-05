"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FamilyTripDocument,
  FamilyTripPayload,
  FamilyTripSyncAnalysis,
  FamilyTripSyncError,
  FamilyTripSyncMetadata,
  analyzeFamilyTripSync,
  applyFamilyTripPayload,
  buildLocalFamilyTripPayload,
  clearFamilySyncMetadata,
  createFamilySyncMetadata,
  fetchFamilyTrip,
  fingerprintFamilyTripPayload,
  loadFamilyKey,
  loadFamilySyncMetadata,
  saveFamilyKey,
  saveFamilySyncMetadata,
  saveFamilyTrip,
} from "../lib/familyTripSync";
import useFamilyTripAutosave, { FAMILY_SYNC_UPDATED_EVENT } from "./useFamilyTripAutosave";

const STYLE_ID = "castlewatch-family-sync-style";
const LOCAL_CHECK_INTERVAL_MS = 1_000;
const REMOTE_CHECK_INTERVAL_MS = 60_000;

type ConfirmAction = "upload" | "download" | null;

type CheckedSyncState = {
  document: FamilyTripDocument;
  localPayload: FamilyTripPayload;
  metadata: FamilyTripSyncMetadata | null;
  analysis: FamilyTripSyncAnalysis;
};

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .family-sync { border:1px solid rgba(156,118,255,.3); border-radius:16px; margin-bottom:14px; background:rgba(156,118,255,.045); overflow:hidden; }
    .family-sync > summary { cursor:pointer; list-style:none; padding:12px 13px; display:flex; justify-content:space-between; gap:10px; align-items:center; font-weight:900; }
    .family-sync > summary::-webkit-details-marker { display:none; }
    .family-sync-status { border:1px solid rgba(156,118,255,.38); border-radius:999px; padding:4px 8px; font-size:10px; white-space:nowrap; }
    .family-sync-status-connected { border-color:rgba(56,217,150,.4); color:rgb(124,239,191); }
    .family-sync-content { padding:0 13px 13px; }
    .family-sync-content p { margin-top:0; }
    .family-sync-key-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; }
    .family-sync-key-row input { width:100%; border:1px solid rgba(255,255,255,.15); border-radius:10px; padding:9px 10px; background:rgba(0,0,0,.17); color:inherit; font:inherit; }
    .family-sync-button { border:1px solid rgba(255,255,255,.16); border-radius:10px; padding:8px 10px; background:rgba(255,255,255,.045); color:inherit; font:inherit; font-size:11px; font-weight:900; cursor:pointer; }
    .family-sync-button:disabled { cursor:not-allowed; opacity:.55; }
    .family-sync-button-primary { border-color:rgba(56,217,150,.42); background:rgba(56,217,150,.09); }
    .family-sync-button-warning { border-color:rgba(255,184,76,.42); background:rgba(255,184,76,.08); }
    .family-sync-button-danger { border-color:rgba(255,99,99,.4); background:rgba(255,99,99,.07); }
    .family-sync-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }
    .family-sync-remote { border:1px solid rgba(255,255,255,.11); border-radius:12px; padding:9px 10px; margin-top:10px; background:rgba(0,0,0,.08); }
    .family-sync-remote strong { display:block; margin-bottom:3px; }
    .family-sync-awareness { border:1px solid rgba(255,255,255,.13); border-radius:12px; padding:10px; margin-top:10px; background:rgba(0,0,0,.1); }
    .family-sync-awareness strong { display:block; margin-bottom:4px; }
    .family-sync-awareness span { display:block; color:var(--muted); font-size:11px; line-height:1.4; }
    .family-sync-awareness small { display:block; margin-top:7px; color:var(--muted); font-size:9px; }
    .family-sync-awareness-ready { border-color:rgba(56,217,150,.38); background:rgba(56,217,150,.065); }
    .family-sync-awareness-local { border-color:rgba(99,164,255,.4); background:rgba(99,164,255,.065); }
    .family-sync-awareness-remote { border-color:rgba(156,118,255,.42); background:rgba(156,118,255,.07); }
    .family-sync-awareness-warning { border-color:rgba(255,184,76,.42); background:rgba(255,184,76,.065); }
    .family-sync-awareness-conflict { border-color:rgba(255,99,99,.46); background:rgba(255,99,99,.075); }
    .family-sync-message { border-radius:10px; padding:8px 9px; margin-top:9px; font-size:11px; line-height:1.4; }
    .family-sync-error { border:1px solid rgba(255,99,99,.38); background:rgba(255,99,99,.07); }
    .family-sync-success { border:1px solid rgba(56,217,150,.34); background:rgba(56,217,150,.06); }
    .family-sync-confirm { border:1px solid rgba(255,184,76,.36); border-radius:12px; padding:10px; margin-top:10px; background:rgba(255,184,76,.06); }
    .family-sync-confirm strong { display:block; margin-bottom:4px; }
    .family-sync-guard { border:1px solid rgba(255,99,99,.38); border-radius:10px; padding:8px 9px; margin-top:9px; background:rgba(255,99,99,.065); font-size:11px; line-height:1.4; }
    .family-autosave { border:1px solid rgba(255,255,255,.13); border-radius:12px; padding:10px; margin-top:10px; background:rgba(0,0,0,.09); }
    .family-autosave-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .family-autosave-top strong { display:block; }
    .family-autosave-toggle { border:1px solid rgba(255,255,255,.18); border-radius:999px; padding:5px 9px; background:rgba(255,255,255,.045); color:inherit; font:inherit; font-size:10px; font-weight:900; cursor:pointer; white-space:nowrap; }
    .family-autosave-toggle-on { border-color:rgba(56,217,150,.42); color:rgb(124,239,191); background:rgba(56,217,150,.08); }
    .family-autosave-state { display:block; margin-top:8px; font-weight:900; font-size:12px; }
    .family-autosave-detail { display:block; margin-top:3px; color:var(--muted); font-size:10px; line-height:1.45; }
    .family-autosave-time { display:block; margin-top:6px; color:var(--muted); font-size:9px; }
    .family-autosave-ready, .family-autosave-saved { border-color:rgba(56,217,150,.38); background:rgba(56,217,150,.055); }
    .family-autosave-pending, .family-autosave-saving, .family-autosave-retrying { border-color:rgba(99,164,255,.4); background:rgba(99,164,255,.055); }
    .family-autosave-blocked, .family-autosave-failed { border-color:rgba(255,99,99,.42); background:rgba(255,99,99,.06); }
    @media (max-width:700px) {
      .family-sync-key-row { grid-template-columns:1fr; }
      .family-sync-actions { display:grid; grid-template-columns:1fr; }
      .family-sync > summary { align-items:flex-start; }
    }
  `;
  document.head.appendChild(style);
}

function remoteDescription(remote: FamilyTripDocument) {
  if (remote.version === 0 || !remote.payload) return "Shared storage is empty. This device can create the first shared copy.";
  const updated = remote.updatedAt ? new Date(remote.updatedAt).toLocaleString() : "unknown time";
  return `Shared version ${remote.version} · updated ${updated}.`;
}

function matchingBaseline(
  document: FamilyTripDocument,
  localPayload: FamilyTripPayload,
  existing: FamilyTripSyncMetadata | null,
) {
  if (!document.payload) return existing;
  const remoteFingerprint = fingerprintFamilyTripPayload(document.payload);
  if (remoteFingerprint !== fingerprintFamilyTripPayload(localPayload)) return existing;
  if (
    existing
    && existing.version === document.version
    && existing.baselineFingerprint === remoteFingerprint
  ) return existing;

  const metadata = createFamilySyncMetadata(document.version, document.payload);
  saveFamilySyncMetadata(metadata);
  return metadata;
}

function downloadButtonLabel(analysis: FamilyTripSyncAnalysis) {
  if (analysis.id === "remote_changes") return "Download newer shared version";
  if (analysis.id === "conflict" || analysis.id === "local_changes") return "Download shared plan and discard local changes";
  if (analysis.id === "baseline_required") return "Use shared plan as this device’s baseline";
  return "Download shared plan";
}

function uploadButtonLabel(analysis: FamilyTripSyncAnalysis) {
  if (analysis.id === "local_changes") return "Upload local changes";
  if (analysis.id === "baseline_required") return "Use this device as the shared baseline";
  return "Create shared plan from this device";
}

export default function FamilyTripSync() {
  const [key, setKey] = useState("");
  const keyRef = useRef("");
  const [remote, setRemote] = useState<FamilyTripDocument | null>(null);
  const [metadata, setMetadata] = useState<FamilyTripSyncMetadata | null>(null);
  const [localPayload, setLocalPayload] = useState<FamilyTripPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const analysis = useMemo(() => {
    if (!remote || !localPayload) return null;
    return analyzeFamilyTripSync(localPayload, remote, metadata);
  }, [localPayload, metadata, remote]);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const handleFailure = useCallback((value: unknown) => {
    if (value instanceof FamilyTripSyncError) {
      if (value.document?.status === "version_conflict") setRemote(value.document);
      setError(value.message);
      return;
    }
    setError(value instanceof Error ? value.message : "Shared family storage could not be reached.");
  }, []);

  const handleAutosaveSyncState = useCallback((
    document: FamilyTripDocument,
    payload: FamilyTripPayload,
    nextMetadata: FamilyTripSyncMetadata | null,
  ) => {
    setRemote(document);
    setLocalPayload(payload);
    setMetadata(nextMetadata);
    setError(null);
  }, []);

  const connected = remote !== null;
  const autosave = useFamilyTripAutosave({
    connected,
    familyKey: keyRef.current,
    localPayload,
    remote,
    analysis,
    suspended: busy || checking || confirmAction !== null,
    onSyncState: handleAutosaveSyncState,
  });

  const checkRemote = useCallback(async (
    requestedKey?: string,
    announce = false,
  ): Promise<CheckedSyncState | null> => {
    const normalizedKey = (requestedKey ?? keyRef.current).trim();
    if (!normalizedKey) return null;

    setChecking(true);
    try {
      const document = await fetchFamilyTrip(normalizedKey);
      const currentLocal = buildLocalFamilyTripPayload();
      const storedMetadata = loadFamilySyncMetadata();
      const nextMetadata = matchingBaseline(document, currentLocal, storedMetadata);
      const nextAnalysis = analyzeFamilyTripSync(currentLocal, document, nextMetadata);

      keyRef.current = normalizedKey;
      setKey(normalizedKey);
      saveFamilyKey(normalizedKey);
      setRemote(document);
      setLocalPayload(currentLocal);
      setMetadata(nextMetadata);
      setError(null);
      if (announce) {
        setSuccess(document.version === 0
          ? "Connected. Shared storage is ready for its first upload."
          : `Connected. ${nextAnalysis.label}.`);
      }

      return {
        document,
        localPayload: currentLocal,
        metadata: nextMetadata,
        analysis: nextAnalysis,
      };
    } catch (checkError) {
      handleFailure(checkError);
      return null;
    } finally {
      setChecking(false);
    }
  }, [handleFailure]);

  useEffect(() => {
    ensureStyle();
    const savedKey = loadFamilyKey();
    keyRef.current = savedKey;
    setKey(savedKey);
    setMetadata(loadFamilySyncMetadata());
    setLocalPayload(buildLocalFamilyTripPayload());
    if (savedKey) void checkRemote(savedKey, false);
  }, [checkRemote]);

  useEffect(() => {
    function refreshLocal() {
      const next = buildLocalFamilyTripPayload();
      setLocalPayload((current) => {
        if (current && fingerprintFamilyTripPayload(current) === fingerprintFamilyTripPayload(next)) return current;
        return next;
      });
    }

    function checkOnFocus() {
      refreshLocal();
      if (keyRef.current) void checkRemote(undefined, false);
    }

    function checkOnVisibility() {
      if (document.visibilityState === "visible") checkOnFocus();
    }

    const localInterval = window.setInterval(refreshLocal, LOCAL_CHECK_INTERVAL_MS);
    const remoteInterval = window.setInterval(() => {
      if (keyRef.current && document.visibilityState === "visible") void checkRemote(undefined, false);
    }, REMOTE_CHECK_INTERVAL_MS);

    window.addEventListener("focus", checkOnFocus);
    window.addEventListener("storage", refreshLocal);
    document.addEventListener("visibilitychange", checkOnVisibility);

    return () => {
      window.clearInterval(localInterval);
      window.clearInterval(remoteInterval);
      window.removeEventListener("focus", checkOnFocus);
      window.removeEventListener("storage", refreshLocal);
      document.removeEventListener("visibilitychange", checkOnVisibility);
    };
  }, [checkRemote]);

  async function connect() {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      setError("Enter the CastleWatch family key first.");
      return;
    }

    setBusy(true);
    clearMessages();
    setConfirmAction(null);
    await checkRemote(normalizedKey, true);
    setBusy(false);
  }

  async function prepareUpload() {
    setBusy(true);
    clearMessages();
    const checked = await checkRemote(undefined, false);
    if (!checked) {
      setBusy(false);
      return;
    }

    if (!checked.analysis.canUpload) {
      if (checked.analysis.id === "conflict") {
        setError("Upload blocked: both this browser and the shared plan changed. Downloading will discard this browser’s local changes; otherwise leave both copies unchanged until you decide which one to keep.");
      } else if (checked.analysis.id === "remote_changes") {
        setError("Upload blocked because a newer shared version exists. Download it before making additional shared changes.");
      } else {
        setSuccess("No upload is needed. This device is already up to date.");
      }
      setBusy(false);
      return;
    }

    setConfirmAction("upload");
    setBusy(false);
  }

  async function upload() {
    if (!remote) return;
    setBusy(true);
    clearMessages();
    const payload = buildLocalFamilyTripPayload();
    try {
      const document = await saveFamilyTrip(keyRef.current, remote.version, payload);
      const nextMetadata = createFamilySyncMetadata(document.version, payload);
      saveFamilySyncMetadata(nextMetadata);
      setRemote(document);
      setLocalPayload(payload);
      setMetadata(nextMetadata);
      setConfirmAction(null);
      setSuccess(`This device was uploaded as shared version ${document.version}.`);
      window.dispatchEvent(new CustomEvent(FAMILY_SYNC_UPDATED_EVENT));
    } catch (uploadError) {
      setConfirmAction(null);
      if (uploadError instanceof FamilyTripSyncError && uploadError.document) {
        setRemote(uploadError.document);
        setLocalPayload(buildLocalFamilyTripPayload());
      }
      handleFailure(uploadError);
    } finally {
      setBusy(false);
    }
  }

  async function prepareDownload() {
    setBusy(true);
    clearMessages();
    const checked = await checkRemote(undefined, false);
    if (checked?.document.payload && checked.analysis.canDownload) {
      setConfirmAction("download");
    } else if (checked?.analysis.id === "up_to_date") {
      setSuccess("No download is needed. This device is already up to date.");
    }
    setBusy(false);
  }

  function download() {
    if (!remote?.payload) return;
    clearMessages();
    const nextMetadata = createFamilySyncMetadata(remote.version, remote.payload);
    saveFamilySyncMetadata(nextMetadata);
    applyFamilyTripPayload(remote.payload);
    window.location.reload();
  }

  function disconnect() {
    autosave.setEnabled(false);
    saveFamilyKey("");
    clearFamilySyncMetadata();
    keyRef.current = "";
    setKey("");
    setRemote(null);
    setMetadata(null);
    setConfirmAction(null);
    clearMessages();
  }

  const disabled = busy || checking;
  const autosaveTime = autosave.lastSavedAt ? new Date(autosave.lastSavedAt).toLocaleString() : null;
  const retryTime = autosave.nextAttemptAt ? new Date(autosave.nextAttemptAt).toLocaleTimeString() : null;

  return (
    <details className="family-sync" open={connected || Boolean(error)}>
      <summary>
        <span>Shared Family Plan</span>
        <span className={`family-sync-status ${connected ? "family-sync-status-connected" : ""}`}>
          {checking && connected ? "Checking…" : connected ? `Connected · v${remote.version}` : "Not connected"}
        </span>
      </summary>
      <div className="family-sync-content">
        <p className="muted">
          CastleWatch checks for newer versions when this page opens or regains focus. Guarded autosave is off by default on each browser, and manual upload and download always remain available.
        </p>

        {!connected && (
          <div className="family-sync-key-row">
            <input
              aria-label="CastleWatch family key"
              type="password"
              autoComplete="current-password"
              placeholder="Family key"
              value={key}
              onChange={(event) => {
                setKey(event.target.value);
                keyRef.current = event.target.value;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void connect();
              }}
            />
            <button className="family-sync-button family-sync-button-primary" type="button" disabled={disabled} onClick={() => void connect()}>
              {busy ? "Connecting…" : "Connect"}
            </button>
          </div>
        )}

        {connected && remote && analysis && (
          <>
            <div className="family-sync-remote">
              <strong>{remote.version === 0 ? "No shared plan yet" : "Shared plan available"}</strong>
              <span className="muted">{remoteDescription(remote)}</span>
            </div>

            <div className={`family-sync-awareness family-sync-awareness-${analysis.tone}`}>
              <strong>{analysis.label}</strong>
              <span>{analysis.detail}</span>
              {metadata && (
                <small>Last synchronized baseline: version {metadata.version} · {new Date(metadata.syncedAt).toLocaleString()}</small>
              )}
            </div>

            <div className={`family-autosave family-autosave-${autosave.phase}`}>
              <div className="family-autosave-top">
                <strong>Guarded autosave</strong>
                <button
                  className={`family-autosave-toggle ${autosave.enabled ? "family-autosave-toggle-on" : ""}`}
                  type="button"
                  aria-pressed={autosave.enabled}
                  disabled={busy || checking}
                  onClick={() => autosave.setEnabled(!autosave.enabled)}
                >
                  {autosave.enabled ? "Enabled on this browser" : "Off"}
                </button>
              </div>
              <span className="family-autosave-state">{autosave.label}</span>
              <span className="family-autosave-detail">{autosave.detail}</span>
              {autosaveTime && <small className="family-autosave-time">Last autosave: {autosaveTime}</small>}
              {retryTime && <small className="family-autosave-time">Next attempt: {retryTime}</small>}
            </div>

            {analysis.id === "conflict" && (
              <div className="family-sync-guard">
                CastleWatch has disabled uploading and autosave. Downloading the shared version will discard this browser’s local changes; otherwise leave both copies unchanged until the preferred version is chosen.
              </div>
            )}

            <div className="family-sync-actions">
              {analysis.canDownload && (
                <button className="family-sync-button family-sync-button-primary" type="button" disabled={disabled} onClick={() => void prepareDownload()}>
                  {downloadButtonLabel(analysis)}
                </button>
              )}
              {analysis.canUpload && (
                <button className="family-sync-button family-sync-button-warning" type="button" disabled={disabled} onClick={() => void prepareUpload()}>
                  {uploadButtonLabel(analysis)}
                </button>
              )}
              <button className="family-sync-button" type="button" disabled={disabled} onClick={() => void checkRemote(undefined, true)}>
                {checking ? "Checking…" : "Check shared status now"}
              </button>
              <button className="family-sync-button family-sync-button-danger" type="button" disabled={disabled} onClick={disconnect}>Disconnect this device</button>
            </div>
          </>
        )}

        {confirmAction === "download" && remote?.payload && analysis && (
          <div className="family-sync-confirm">
            <strong>{analysis.localChanged ? "Discard this browser’s local changes?" : "Use the shared plan on this device?"}</strong>
            <div className="muted">
              Reservations, resorts, trip details and the active/locked park order on this device will be replaced by shared version {remote.version}.
              {analysis.localChanged ? " Any local changes since the last synchronized baseline will be lost." : ""} Trip Week will reload once after confirmation.
            </div>
            <div className="family-sync-actions">
              <button className="family-sync-button family-sync-button-primary" type="button" onClick={download}>Confirm download</button>
              <button className="family-sync-button" type="button" onClick={() => setConfirmAction(null)}>Cancel</button>
            </div>
          </div>
        )}

        {confirmAction === "upload" && remote && analysis && (
          <div className="family-sync-confirm">
            <strong>{analysis.id === "baseline_required" ? `Use this device instead of shared version ${remote.version}?` : `Upload changes over shared version ${remote.version}?`}</strong>
            <div className="muted">
              CastleWatch checked the current server version immediately before opening this confirmation. The database will reject the upload if another device saves a newer version before this upload finishes.
            </div>
            <div className="family-sync-actions">
              <button className="family-sync-button family-sync-button-warning" type="button" disabled={busy} onClick={() => void upload()}>
                {busy ? "Uploading…" : "Confirm upload"}
              </button>
              <button className="family-sync-button" type="button" disabled={busy} onClick={() => setConfirmAction(null)}>Cancel</button>
            </div>
          </div>
        )}

        {error && <div className="family-sync-message family-sync-error">{error}</div>}
        {success && <div className="family-sync-message family-sync-success">{success}</div>}
      </div>
    </details>
  );
}
