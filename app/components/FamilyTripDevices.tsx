"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FamilyTripDeviceAccessResponse,
  FamilyTripDeviceAuth,
  FamilyTripDeviceError,
  FamilyTripDeviceRecord,
  StoredFamilyDeviceAccess,
  acceptFamilyTripInvite,
  checkFamilyTripDeviceAccess,
  clearFamilyDeviceAccess,
  createFamilyTripInvite,
  listFamilyTripDevices,
  loadFamilyDeviceAccess,
  renameFamilyTripDevice,
  revokeFamilyTripDevice,
  saveFamilyDeviceAccess,
} from "../lib/familyTripDevices";
import { loadFamilyKey } from "../lib/familyTripSync";

const STYLE_ID = "castlewatch-family-devices-style";

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .family-devices { border:1px solid rgba(142,197,255,.25); border-radius:16px; margin-bottom:14px; background:rgba(142,197,255,.04); overflow:hidden; }
    .family-devices > summary { cursor:pointer; list-style:none; padding:12px 13px; display:flex; justify-content:space-between; gap:10px; align-items:center; font-weight:900; }
    .family-devices > summary::-webkit-details-marker { display:none; }
    .family-devices-status { border:1px solid rgba(142,197,255,.32); border-radius:999px; padding:4px 8px; font-size:10px; white-space:nowrap; }
    .family-devices-content { padding:0 13px 13px; }
    .family-devices-content p { margin-top:0; }
    .family-devices-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }
    .family-devices-button { border:1px solid rgba(255,255,255,.16); border-radius:10px; padding:8px 10px; background:rgba(255,255,255,.045); color:inherit; font:inherit; font-size:11px; font-weight:900; cursor:pointer; }
    .family-devices-button:disabled { cursor:not-allowed; opacity:.55; }
    .family-devices-button-primary { border-color:rgba(56,217,150,.42); background:rgba(56,217,150,.09); }
    .family-devices-button-warning { border-color:rgba(255,184,76,.42); background:rgba(255,184,76,.08); }
    .family-devices-button-danger { border-color:rgba(255,99,99,.4); background:rgba(255,99,99,.07); }
    .family-devices-grid { display:grid; gap:10px; margin-top:10px; }
    .family-devices-card { border:1px solid rgba(255,255,255,.11); border-radius:12px; padding:10px; background:rgba(0,0,0,.08); }
    .family-devices-card strong { display:block; margin-bottom:4px; }
    .family-devices-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; align-items:center; margin-top:8px; }
    .family-devices-fields { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; margin-top:8px; }
    .family-devices-fields input, .family-devices-fields select, .family-devices-token, .family-devices-rename { width:100%; border:1px solid rgba(255,255,255,.15); border-radius:10px; padding:9px 10px; background:rgba(0,0,0,.17); color:inherit; font:inherit; }
    .family-devices-token { resize:vertical; min-height:64px; word-break:break-all; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:11px; }
    .family-devices-message { border-radius:10px; padding:8px 9px; margin-top:9px; font-size:11px; line-height:1.4; }
    .family-devices-error { border:1px solid rgba(255,99,99,.38); background:rgba(255,99,99,.07); }
    .family-devices-success { border:1px solid rgba(56,217,150,.34); background:rgba(56,217,150,.06); }
    .family-devices-access { border:1px solid rgba(142,197,255,.28); border-radius:12px; padding:10px; margin-top:10px; background:rgba(142,197,255,.055); }
    .family-devices-warning { border:1px solid rgba(255,184,76,.36); border-radius:12px; padding:10px; margin-top:10px; background:rgba(255,184,76,.08); }
    .family-devices-revoke-confirm { border:1px solid rgba(255,184,76,.36); border-radius:12px; padding:10px; margin-top:10px; background:rgba(255,184,76,.08); }
    .family-devices-revoke-confirm strong { margin-bottom:4px; }
    .family-devices-local { border:1px solid rgba(56,217,150,.32); border-radius:12px; padding:10px; margin-top:10px; background:rgba(56,217,150,.055); }
    .family-devices-local strong { display:block; margin-bottom:4px; }
    .family-devices-meta { display:block; color:var(--muted); font-size:10px; line-height:1.45; }
    @media (max-width:700px) {
      .family-devices > summary { align-items:flex-start; }
      .family-devices-row, .family-devices-fields { grid-template-columns:1fr; }
      .family-devices-actions { display:grid; grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(style);
}

function formatDate(value: string | null) {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function deviceAuth(familyKey: string, localDevice: StoredFamilyDeviceAccess | null): FamilyTripDeviceAuth | null {
  const key = familyKey.trim();
  if (key) return { key };
  const deviceToken = localDevice?.deviceToken.trim() || "";
  if (deviceToken) return { deviceToken };
  return null;
}

function errorMessage(value: unknown) {
  if (value instanceof FamilyTripDeviceError) return value.message;
  if (value instanceof Error) return value.message;
  return "Device management could not be reached.";
}

function accessLabel(access: FamilyTripDeviceAccessResponse | null, familyKey: string, localDevice: StoredFamilyDeviceAccess | null) {
  if (access?.authState === "family_key") return "Connected by family key";
  if (access?.authState === "device_token") return "Connected by device token";
  if (access?.authState === "revoked_device_token") return "Saved token revoked";
  if (localDevice) return `Saved token: ${localDevice.displayName}`;
  if (familyKey.trim()) return "Family key available";
  return "Invite ready";
}

export default function FamilyTripDevices() {
  const [familyKey, setFamilyKey] = useState("");
  const [localDevice, setLocalDevice] = useState<StoredFamilyDeviceAccess | null>(null);
  const [accessState, setAccessState] = useState<FamilyTripDeviceAccessResponse | null>(null);
  const [devices, setDevices] = useState<FamilyTripDeviceRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviteLabel, setInviteLabel] = useState("Katie iPhone");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteToken, setInviteToken] = useState("");
  const [acceptToken, setAcceptToken] = useState("");
  const [acceptName, setAcceptName] = useState("");
  const [renameValues, setRenameValues] = useState<Record<string, string>>({});
  const [pendingRevokeDeviceId, setPendingRevokeDeviceId] = useState<string | null>(null);

  useEffect(() => {
    ensureStyle();
    setFamilyKey(loadFamilyKey());
    const stored = loadFamilyDeviceAccess();
    setLocalDevice(stored);
    if (stored?.displayName) setAcceptName(stored.displayName);
  }, []);

  const auth = useMemo(() => deviceAuth(familyKey, localDevice), [familyKey, localDevice]);
  const canAttemptAuthenticatedAction = Boolean(auth);
  const disabled = Boolean(busy);
  const familyKeyOnly = Boolean(familyKey.trim()) && !localDevice;

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  async function checkAccessState() {
    if (!auth) {
      setAccessState(null);
      setError("This browser is not connected. Use the family key or accept an invite.");
      return;
    }

    setBusy("access");
    clearMessages();
    try {
      const response = await checkFamilyTripDeviceAccess(auth);
      setAccessState(response);
      if (response.authState === "revoked_device_token") {
        if (localDevice && (!response.device || response.device.id === localDevice.deviceId)) {
          clearFamilyDeviceAccess();
          setLocalDevice(null);
        }
        setError(response.message || "This saved device token was revoked. Reconnect with a new invite or use the family key.");
      } else if (response.authState === "family_key") {
        setSuccess("This browser is connected by the family key owner path. Keep it enabled until device access is fully verified.");
      } else if (response.authState === "device_token") {
        setSuccess(response.device
          ? `${response.device.displayName} is connected by device token as ${response.role}.`
          : "This browser is connected by device token.");
      }
    } catch (accessError) {
      setError(errorMessage(accessError));
    } finally {
      setBusy(null);
    }
  }

  async function refreshDevices() {
    if (!auth) {
      setError("Connect Shared Family Plan with the family key first, or accept an invite on this browser.");
      return;
    }

    setBusy("refresh");
    clearMessages();
    try {
      const response = await listFamilyTripDevices(auth);
      setDevices(response.devices);
      setLoaded(true);
      setPendingRevokeDeviceId(null);
      setRenameValues((current) => {
        const next = { ...current };
        for (const device of response.devices) {
          if (!next[device.id]) next[device.id] = device.displayName;
        }
        return next;
      });
      setSuccess(response.devices.length
        ? `Loaded ${response.devices.length} connected device${response.devices.length === 1 ? "" : "s"}.`
        : "No connected devices are listed yet.");
    } catch (refreshError) {
      setError(errorMessage(refreshError));
    } finally {
      setBusy(null);
    }
  }

  async function createInvite() {
    if (!auth) {
      setError("Connect Shared Family Plan with the family key before creating an invite.");
      return;
    }

    setBusy("invite");
    clearMessages();
    setInviteToken("");
    try {
      const response = await createFamilyTripInvite(auth, {
        role: inviteRole,
        label: inviteLabel.trim() || "New device",
      });
      setInviteToken(response.inviteToken);
      setSuccess("Invite created. Copy the token now; CastleWatch will not show it again after you leave this panel.");
    } catch (inviteError) {
      setError(errorMessage(inviteError));
    } finally {
      setBusy(null);
    }
  }

  async function acceptInvite() {
    const token = acceptToken.trim();
    if (!token) {
      setError("Paste an invite token first.");
      return;
    }

    setBusy("accept");
    clearMessages();
    try {
      const response = await acceptFamilyTripInvite(token, acceptName.trim() || "This device");
      if (response.deviceToken) {
        saveFamilyDeviceAccess(response.deviceToken, response.device);
        setLocalDevice(loadFamilyDeviceAccess());
        setAccessState(response.device ? {
          status: "ok",
          authState: "device_token",
          role: response.device.role,
          device: response.device,
          canManageDevices: response.device.role === "owner",
          canWriteSharedPlan: response.device.role === "owner" || response.device.role === "editor",
          migrationRecommended: false,
          message: "This browser is connected with a device token.",
        } : null);
      }
      setAcceptToken("");
      setSuccess(response.device
        ? `${response.device.displayName} was connected and saved on this browser.`
        : "This browser was connected and saved.");
    } catch (acceptError) {
      setError(errorMessage(acceptError));
    } finally {
      setBusy(null);
    }
  }

  async function renameDevice(device: FamilyTripDeviceRecord) {
    if (!auth) return;
    const displayName = (renameValues[device.id] || "").trim();
    if (!displayName) {
      setError("Device name cannot be blank.");
      return;
    }

    setBusy(`rename-${device.id}`);
    clearMessages();
    try {
      const response = await renameFamilyTripDevice(auth, device.id, displayName);
      const nextDevice = response.device;
      if (nextDevice) {
        setDevices((current) => current.map((entry) => entry.id === nextDevice.id ? nextDevice : entry));
        if (localDevice?.deviceId === nextDevice.id) {
          saveFamilyDeviceAccess(localDevice.deviceToken, nextDevice);
          setLocalDevice(loadFamilyDeviceAccess());
        }
        setSuccess(`${nextDevice.displayName} was renamed.`);
      }
    } catch (renameError) {
      setError(errorMessage(renameError));
    } finally {
      setBusy(null);
    }
  }

  function requestRevokeDevice(device: FamilyTripDeviceRecord) {
    clearMessages();
    setPendingRevokeDeviceId(device.id);
    setSuccess(`Press Confirm revoke to revoke ${device.displayName}.`);
  }

  async function revokeDevice(device: FamilyTripDeviceRecord) {
    if (!auth) return;

    setBusy(`revoke-${device.id}`);
    clearMessages();
    try {
      const response = await revokeFamilyTripDevice(auth, device.id);
      const nextDevice = response.device;
      if (nextDevice) {
        setDevices((current) => current.map((entry) => entry.id === nextDevice.id ? nextDevice : entry));
        setPendingRevokeDeviceId(null);
        if (localDevice?.deviceId === nextDevice.id) {
          clearFamilyDeviceAccess();
          setLocalDevice(null);
          setAccessState({
            status: "revoked",
            authState: "revoked_device_token",
            role: nextDevice.role,
            device: nextDevice,
            canManageDevices: false,
            canWriteSharedPlan: false,
            migrationRecommended: false,
            message: "This saved device token was revoked. Reconnect with a new invite or use the family key.",
          });
        }
        try {
          const latest = await listFamilyTripDevices(auth);
          setDevices(latest.devices);
        } catch {
          // The revoke response already updated the local list; a failed follow-up refresh should not hide success.
        }
        setSuccess(`${nextDevice.displayName} was revoked.`);
      }
    } catch (revokeError) {
      setError(errorMessage(revokeError));
    } finally {
      setBusy(null);
    }
  }

  function clearLocalDevice() {
    clearFamilyDeviceAccess();
    setLocalDevice(null);
    setAccessState(null);
    setSuccess("Saved device token cleared from this browser. The server-side device record was not revoked.");
    setError(null);
  }

  return (
    <details className="family-devices">
      <summary>
        <span>Family devices</span>
        <span className="family-devices-status">
          {accessLabel(accessState, familyKey, localDevice)}
        </span>
      </summary>
      <div className="family-devices-content">
        <p className="muted">
          Manage device access manually. This panel does not poll, does not send texts, and does not change or disable the current family key.
        </p>

        {familyKeyOnly && (
          <div className="family-devices-warning">
            <strong>Migration prep</strong>
            <span className="family-devices-meta">This browser is still using the family key owner path. Before any future family-key retirement, connect this browser with a device invite. The family key remains enabled for recovery.</span>
          </div>
        )}

        {localDevice && (
          <div className="family-devices-local">
            <strong>This browser has a saved device token</strong>
            <span className="family-devices-meta">{localDevice.displayName} · {localDevice.role} · saved {formatDate(localDevice.savedAt)}</span>
            <div className="family-devices-actions">
              <button className="family-devices-button" type="button" onClick={clearLocalDevice}>Clear saved token from this browser</button>
            </div>
          </div>
        )}

        {accessState && (
          <div className={accessState.authState === "revoked_device_token" ? "family-devices-message family-devices-error" : "family-devices-access"}>
            <strong>Access state: {accessLabel(accessState, familyKey, localDevice)}</strong>
            <span className="family-devices-meta">
              {accessState.message || "Access state checked."}
              {accessState.device ? ` Device: ${accessState.device.displayName} · ${accessState.device.role} · ${accessState.device.status}.` : ""}
            </span>
          </div>
        )}

        {error && <div className="family-devices-message family-devices-error">{error}</div>}
        {success && <div className="family-devices-message family-devices-success">{success}</div>}

        <div className="family-devices-actions">
          <button className="family-devices-button" type="button" disabled={disabled || !canAttemptAuthenticatedAction} onClick={() => void checkAccessState()}>
            {busy === "access" ? "Checking…" : "Check access state"}
          </button>
          <button className="family-devices-button family-devices-button-primary" type="button" disabled={disabled || !canAttemptAuthenticatedAction} onClick={() => void refreshDevices()}>
            {busy === "refresh" ? "Refreshing…" : "Refresh device list"}
          </button>
        </div>

        {loaded && (
          <div className="family-devices-grid">
            {devices.length === 0 && (
              <div className="family-devices-card muted">No devices are listed yet.</div>
            )}
            {devices.map((device) => (
              <div className="family-devices-card" key={device.id}>
                <strong>{device.displayName}</strong>
                <span className="family-devices-meta">
                  {device.role} · {device.status} · last seen {formatDate(device.lastSeenAt)} · token prefix {device.tokenPrefix || "hidden"}
                </span>
                {device.revokedAt && <span className="family-devices-meta">Revoked {formatDate(device.revokedAt)}</span>}
                {device.status === "active" && (
                  <div className="family-devices-row">
                    <input
                      className="family-devices-rename"
                      aria-label={`Rename ${device.displayName}`}
                      value={renameValues[device.id] ?? device.displayName}
                      onChange={(event) => setRenameValues((current) => ({ ...current, [device.id]: event.target.value }))}
                    />
                    <div className="family-devices-actions" style={{ marginTop: 0 }}>
                      <button className="family-devices-button" type="button" disabled={disabled} onClick={() => void renameDevice(device)}>
                        {busy === `rename-${device.id}` ? "Renaming…" : "Rename"}
                      </button>
                      <button className="family-devices-button family-devices-button-danger" type="button" disabled={disabled} onClick={() => requestRevokeDevice(device)}>
                        Revoke
                      </button>
                    </div>
                    {pendingRevokeDeviceId === device.id && (
                      <div className="family-devices-revoke-confirm">
                        <strong>Confirm revoke</strong>
                        <span className="family-devices-meta">{device.displayName} will lose device-token access on its next request. The family key stays enabled.</span>
                        <div className="family-devices-actions">
                          <button className="family-devices-button family-devices-button-danger" type="button" disabled={disabled} onClick={() => void revokeDevice(device)}>
                            {busy === `revoke-${device.id}` ? "Revoking…" : "Confirm revoke"}
                          </button>
                          <button className="family-devices-button" type="button" disabled={disabled} onClick={() => setPendingRevokeDeviceId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="family-devices-grid">
          <div className="family-devices-card">
            <strong>Create invite</strong>
            <span className="family-devices-meta">Use the family key owner path to make a 7-day invite for another browser or phone.</span>
            <div className="family-devices-fields">
              <input value={inviteLabel} onChange={(event) => setInviteLabel(event.target.value)} aria-label="Invite label" placeholder="Katie iPhone" />
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "editor" | "viewer")} aria-label="Invite role">
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div className="family-devices-actions">
              <button className="family-devices-button family-devices-button-primary" type="button" disabled={disabled || !canAttemptAuthenticatedAction} onClick={() => void createInvite()}>
                {busy === "invite" ? "Creating…" : "Create invite"}
              </button>
            </div>
            {inviteToken && (
              <div className="family-devices-card">
                <strong>One-time invite token</strong>
                <span className="family-devices-meta">Copy this now. It is not stored in the device list.</span>
                <textarea className="family-devices-token" readOnly value={inviteToken} aria-label="One-time invite token" />
              </div>
            )}
          </div>

          <div className="family-devices-card">
            <strong>Accept invite on this browser</strong>
            <span className="family-devices-meta">Paste an invite token here on the phone or browser you want to connect. The resulting device token is saved locally and not displayed.</span>
            <div className="family-devices-fields">
              <input value={acceptName} onChange={(event) => setAcceptName(event.target.value)} aria-label="This device name" placeholder="This device name" />
              <input value={acceptToken} onChange={(event) => setAcceptToken(event.target.value)} aria-label="Invite token" placeholder="Invite token" />
            </div>
            <div className="family-devices-actions">
              <button className="family-devices-button family-devices-button-warning" type="button" disabled={disabled} onClick={() => void acceptInvite()}>
                {busy === "accept" ? "Connecting…" : "Accept invite"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
