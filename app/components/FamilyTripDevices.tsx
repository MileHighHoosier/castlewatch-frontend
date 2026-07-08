"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FamilyTripDeviceAuth,
  FamilyTripDeviceError,
  FamilyTripDeviceRecord,
  StoredFamilyDeviceAccess,
  acceptFamilyTripInvite,
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

export default function FamilyTripDevices() {
  const [familyKey, setFamilyKey] = useState("");
  const [localDevice, setLocalDevice] = useState<StoredFamilyDeviceAccess | null>(null);
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

  useEffect(() => {
    ensureStyle();
    setFamilyKey(loadFamilyKey());
    const stored = loadFamilyDeviceAccess();
    setLocalDevice(stored);
    if (!acceptName && stored?.displayName) setAcceptName(stored.displayName);
  }, [acceptName]);

  const auth = useMemo(() => deviceAuth(familyKey, localDevice), [familyKey, localDevice]);
  const canManage = Boolean(auth);
  const disabled = Boolean(busy);

  function clearMessages() {
    setError(null);
    setSuccess(null);
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
      if (response.device) {
        setDevices((current) => current.map((entry) => entry.id === response.device?.id ? response.device : entry));
        if (localDevice?.deviceId === response.device.id) {
          saveFamilyDeviceAccess(localDevice.deviceToken, response.device);
          setLocalDevice(loadFamilyDeviceAccess());
        }
        setSuccess(`${response.device.displayName} was renamed.`);
      }
    } catch (renameError) {
      setError(errorMessage(renameError));
    } finally {
      setBusy(null);
    }
  }

  async function revokeDevice(device: FamilyTripDeviceRecord) {
    if (!auth) return;
    if (typeof window !== "undefined" && !window.confirm(`Revoke ${device.displayName}? That device will lose access on its next request.`)) return;

    setBusy(`revoke-${device.id}`);
    clearMessages();
    try {
      const response = await revokeFamilyTripDevice(auth, device.id);
      if (response.device) {
        setDevices((current) => current.map((entry) => entry.id === response.device?.id ? response.device : entry));
        if (localDevice?.deviceId === response.device.id) {
          clearFamilyDeviceAccess();
          setLocalDevice(null);
        }
        setSuccess(`${response.device.displayName} was revoked.`);
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
    setSuccess("Saved device token cleared from this browser. The server-side device record was not revoked.");
    setError(null);
  }

  return (
    <details className="family-devices">
      <summary>
        <span>Family devices</span>
        <span className="family-devices-status">
          {localDevice ? `This browser: ${localDevice.displayName}` : familyKey ? "Family key available" : "Invite ready"}
        </span>
      </summary>
      <div className="family-devices-content">
        <p className="muted">
          Manage device access manually. This panel does not poll, does not send texts, and does not change or disable the current family key.
        </p>

        {localDevice && (
          <div className="family-devices-local">
            <strong>This browser has a saved device token</strong>
            <span className="family-devices-meta">{localDevice.displayName} · {localDevice.role} · saved {formatDate(localDevice.savedAt)}</span>
            <div className="family-devices-actions">
              <button className="family-devices-button" type="button" onClick={clearLocalDevice}>Clear saved token from this browser</button>
            </div>
          </div>
        )}

        <div className="family-devices-actions">
          <button className="family-devices-button family-devices-button-primary" type="button" disabled={disabled || !canManage} onClick={() => void refreshDevices()}>
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
                      <button className="family-devices-button family-devices-button-danger" type="button" disabled={disabled} onClick={() => void revokeDevice(device)}>
                        {busy === `revoke-${device.id}` ? "Revoking…" : "Revoke"}
                      </button>
                    </div>
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
              <button className="family-devices-button family-devices-button-primary" type="button" disabled={disabled || !canManage} onClick={() => void createInvite()}>
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

        {error && <div className="family-devices-message family-devices-error">{error}</div>}
        {success && <div className="family-devices-message family-devices-success">{success}</div>}
      </div>
    </details>
  );
}
