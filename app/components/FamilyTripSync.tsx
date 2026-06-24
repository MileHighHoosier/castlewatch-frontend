"use client";

import { useEffect, useState } from "react";
import {
  FamilyTripDocument,
  FamilyTripSyncError,
  applyFamilyTripPayload,
  buildLocalFamilyTripPayload,
  fetchFamilyTrip,
  loadFamilyKey,
  saveFamilyKey,
  saveFamilyTrip,
} from "../lib/familyTripSync";

const STYLE_ID = "castlewatch-family-sync-style";

type ConfirmAction = "upload" | "download" | null;

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
    .family-sync-message { border-radius:10px; padding:8px 9px; margin-top:9px; font-size:11px; line-height:1.4; }
    .family-sync-error { border:1px solid rgba(255,99,99,.38); background:rgba(255,99,99,.07); }
    .family-sync-success { border:1px solid rgba(56,217,150,.34); background:rgba(56,217,150,.06); }
    .family-sync-confirm { border:1px solid rgba(255,184,76,.36); border-radius:12px; padding:10px; margin-top:10px; background:rgba(255,184,76,.06); }
    .family-sync-confirm strong { display:block; margin-bottom:4px; }
    @media (max-width:700px) {
      .family-sync-key-row { grid-template-columns:1fr; }
      .family-sync-actions { display:grid; grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(style);
}

function remoteDescription(remote: FamilyTripDocument) {
  if (remote.version === 0 || !remote.payload) return "Shared storage is empty. This device can create the first shared copy.";
  const updated = remote.updatedAt ? new Date(remote.updatedAt).toLocaleString() : "unknown time";
  return `Shared version ${remote.version} · updated ${updated}.`;
}

export default function FamilyTripSync() {
  const [key, setKey] = useState("");
  const [remote, setRemote] = useState<FamilyTripDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  useEffect(() => {
    ensureStyle();
    setKey(loadFamilyKey());
  }, []);

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  function handleFailure(value: unknown) {
    if (value instanceof FamilyTripSyncError) {
      if (value.document?.status === "version_conflict") setRemote(value.document);
      setError(value.message);
      return;
    }
    setError(value instanceof Error ? value.message : "Shared family storage could not be reached.");
  }

  async function connect() {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      setError("Enter the CastleWatch family key first.");
      return;
    }

    setBusy(true);
    clearMessages();
    setConfirmAction(null);
    try {
      const document = await fetchFamilyTrip(normalizedKey);
      setRemote(document);
      saveFamilyKey(normalizedKey);
      setSuccess(document.version === 0 ? "Connected. Shared storage is ready for its first upload." : "Connected to the shared family plan.");
    } catch (connectError) {
      setRemote(null);
      handleFailure(connectError);
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!remote) return;
    setBusy(true);
    clearMessages();
    try {
      const document = await saveFamilyTrip(key, remote.version, buildLocalFamilyTripPayload());
      setRemote(document);
      setConfirmAction(null);
      setSuccess(`This device was uploaded as shared version ${document.version}.`);
    } catch (uploadError) {
      setConfirmAction(null);
      handleFailure(uploadError);
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!remote?.payload) return;
    clearMessages();
    applyFamilyTripPayload(remote.payload);
    window.location.reload();
  }

  function disconnect() {
    saveFamilyKey("");
    setKey("");
    setRemote(null);
    setConfirmAction(null);
    clearMessages();
  }

  const connected = remote !== null;

  return (
    <details className="family-sync" open={connected || Boolean(error)}>
      <summary>
        <span>Shared Family Plan</span>
        <span className={`family-sync-status ${connected ? "family-sync-status-connected" : ""}`}>
          {connected ? `Connected · v${remote.version}` : "Not connected"}
        </span>
      </summary>
      <div className="family-sync-content">
        <p className="muted">Use the same private family key on Ryan’s and Katie’s devices. CastleWatch will never replace either copy until you choose upload or download.</p>

        {!connected && (
          <div className="family-sync-key-row">
            <input
              aria-label="CastleWatch family key"
              type="password"
              autoComplete="current-password"
              placeholder="Family key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void connect();
              }}
            />
            <button className="family-sync-button family-sync-button-primary" type="button" disabled={busy} onClick={() => void connect()}>
              {busy ? "Connecting…" : "Connect"}
            </button>
          </div>
        )}

        {connected && remote && (
          <>
            <div className="family-sync-remote">
              <strong>{remote.version === 0 ? "No shared plan yet" : "Shared plan available"}</strong>
              <span className="muted">{remoteDescription(remote)}</span>
            </div>
            <div className="family-sync-actions">
              {remote.version === 0 ? (
                <button className="family-sync-button family-sync-button-primary" type="button" disabled={busy} onClick={() => void upload()}>
                  Create shared plan from this device
                </button>
              ) : (
                <>
                  <button className="family-sync-button family-sync-button-primary" type="button" disabled={busy} onClick={() => setConfirmAction("download")}>
                    Download shared plan
                  </button>
                  <button className="family-sync-button family-sync-button-warning" type="button" disabled={busy} onClick={() => setConfirmAction("upload")}>
                    Replace shared plan with this device
                  </button>
                </>
              )}
              <button className="family-sync-button" type="button" disabled={busy} onClick={() => void connect()}>Refresh shared status</button>
              <button className="family-sync-button family-sync-button-danger" type="button" disabled={busy} onClick={disconnect}>Disconnect this device</button>
            </div>
          </>
        )}

        {confirmAction === "download" && remote?.payload && (
          <div className="family-sync-confirm">
            <strong>Replace this device’s local trip plan?</strong>
            <div className="muted">Reservations, resorts, trip details and the active/locked park order on this device will be replaced by shared version {remote.version}. Trip Week will reload once after confirmation.</div>
            <div className="family-sync-actions">
              <button className="family-sync-button family-sync-button-primary" type="button" onClick={download}>Confirm download</button>
              <button className="family-sync-button" type="button" onClick={() => setConfirmAction(null)}>Cancel</button>
            </div>
          </div>
        )}

        {confirmAction === "upload" && remote && (
          <div className="family-sync-confirm">
            <strong>Replace shared version {remote.version}?</strong>
            <div className="muted">The current data on this device will become the new shared family plan. A stale version cannot overwrite a newer server version.</div>
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
