"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FamilyTripDeviceAccessResponse,
  FamilyTripDeviceAuth,
  FamilyTripDeviceError,
  FamilyTripDeviceRecord,
  StoredFamilyDeviceAccess,
  acceptFamilyTripInvite,
  bootstrapFamilyOwnerDevice,
  canOfferFamilyOwnerBootstrap,
  checkFamilyTripDeviceAccess,
  clearFamilyDeviceAccess,
  clearProtectedFamilyDeviceAccess,
  createFamilyTripInvite,
  hasLegacyFamilyDeviceAccess,
  listFamilyTripDevices,
  loadFamilyDeviceAccess,
  migrateLegacyFamilyDeviceAccess,
  parseFamilyTripDeviceAccessResponse,
  renameFamilyTripDevice,
  revokeFamilyTripDevice,
  saveFamilyDeviceAccess,
  summarizeFamilyTripDevices,
} from "../lib/familyTripDevices";
import { loadFamilyKey } from "../lib/familyTripSync";
import {
  FAMILY_AUTHORIZATION_UPDATED_EVENT,
  loadFamilyTripAuthorizationSelection,
  loadFamilyTripAuthorizationMode,
  saveFamilyTripAuthorizationMode,
} from "../lib/familyTripAuthorization";

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

type CredentialMode = "family_key" | "device_cookie" | null;

function deviceAuth(familyKey: string, credentialMode: CredentialMode): FamilyTripDeviceAuth | null {
  if (credentialMode === "device_cookie") return { mode: "device_cookie" };
  const key = familyKey.trim();
  if (credentialMode === "family_key" && key) return { mode: "family_key", key };
  return null;
}

function errorMessage(value: unknown) {
  if (value instanceof FamilyTripDeviceError) return value.message;
  if (value instanceof Error) return value.message;
  return "Device management could not be reached.";
}

function accessLabel(
  access: FamilyTripDeviceAccessResponse | null,
  familyKey: string,
  localDevice: StoredFamilyDeviceAccess | null,
  credentialMode: CredentialMode,
) {
  if (access?.authState === "family_key") return "Connected by family key";
  if (access?.authState === "device_token") return "Connected by protected device credential";
  if (access?.authState === "revoked_device_token") return "Protected credential revoked";
  if (access?.authState === "rejected_device_token") return "Protected credential rejected";
  if (credentialMode === "device_cookie") return localDevice
    ? `Protected device: ${localDevice.displayName}`
    : "Protected device selected";
  if (credentialMode === "family_key" && familyKey.trim()) return "Family-key recovery selected";
  if (localDevice) return `Protected device available: ${localDevice.displayName}`;
  if (familyKey.trim()) return "Family key available";
  return "Invite ready";
}

export default function FamilyTripDevices() {
  const [familyKey, setFamilyKey] = useState("");
  const [localDevice, setLocalDevice] = useState<StoredFamilyDeviceAccess | null>(null);
  const [credentialMode, setCredentialMode] = useState<CredentialMode>(null);
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
  const [bootstrapName, setBootstrapName] = useState("Owner browser");
  const [bootstrapConfirmation, setBootstrapConfirmation] = useState(false);
  const [localRenameValue, setLocalRenameValue] = useState("");
  const [renameValues, setRenameValues] = useState<Record<string, string>>({});
  const [pendingRevokeDeviceId, setPendingRevokeDeviceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureStyle();
    const key = loadFamilyKey();
    setFamilyKey(key);
    const stored = loadFamilyDeviceAccess();
    setLocalDevice(stored);
    setLocalRenameValue(stored?.displayName || "");
    if (stored?.displayName) setAcceptName(stored.displayName);
    if (!hasLegacyFamilyDeviceAccess()) {
      const selection = loadFamilyTripAuthorizationSelection();
      setCredentialMode(selection === "disconnected"
        ? null
        : loadFamilyTripAuthorizationMode()
          || (stored ? "device_cookie" : key.trim() ? "family_key" : null));
      return () => {
        cancelled = true;
      };
    }

    setBusy("migration");
    void migrateLegacyFamilyDeviceAccess()
      .then((response) => {
        if (cancelled || !response) return;
        const migrated = loadFamilyDeviceAccess();
        setLocalDevice(migrated);
        setLocalRenameValue(migrated?.displayName || "");
        setCredentialMode("device_cookie");
        saveFamilyTripAuthorizationMode("device_cookie");
        setAccessState(response);
        setSuccess("The legacy browser token was moved into protected server-managed storage and removed from local storage.");
      })
      .catch((migrationError) => {
        if (cancelled) return;
        setCredentialMode(null);
        setError(`${errorMessage(migrationError)} The old local token was retained because protected storage was not established.`);
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function refreshSelectedCredential() {
      const nextKey = loadFamilyKey();
      const nextDevice = loadFamilyDeviceAccess();
      const selection = loadFamilyTripAuthorizationSelection();
      setFamilyKey(nextKey);
      setLocalDevice(nextDevice);
      setLocalRenameValue(nextDevice?.displayName || "");
      setCredentialMode(selection === "disconnected"
        ? null
        : loadFamilyTripAuthorizationMode()
          || (nextDevice ? "device_cookie" : nextKey.trim() ? "family_key" : null));
    }
    window.addEventListener("storage", refreshSelectedCredential);
    window.addEventListener(FAMILY_AUTHORIZATION_UPDATED_EVENT, refreshSelectedCredential);
    return () => {
      window.removeEventListener("storage", refreshSelectedCredential);
      window.removeEventListener(FAMILY_AUTHORIZATION_UPDATED_EVENT, refreshSelectedCredential);
    };
  }, []);

  const auth = useMemo(() => deviceAuth(familyKey, credentialMode), [familyKey, credentialMode]);
  const canAttemptAuthenticatedAction = Boolean(auth);
  const disabled = Boolean(busy);
  const familyKeyOnly = Boolean(familyKey.trim()) && !localDevice;
  const canBootstrapOwner = canOfferFamilyOwnerBootstrap(familyKey, credentialMode);

  useEffect(() => {
    if (credentialMode !== "family_key") setBootstrapConfirmation(false);
  }, [credentialMode]);

  function clearMessages() {
    setError(null);
    setSuccess(null);
  }

  function disconnectRejectedDeviceCredential(value: unknown) {
    if (
      credentialMode !== "device_cookie"
      || !(value instanceof FamilyTripDeviceError)
      || value.statusCode !== 401
    ) return false;

    const parsed = parseFamilyTripDeviceAccessResponse(value.payload);
    const authState = parsed.authState === "revoked_device_token"
      ? "revoked_device_token"
      : "rejected_device_token";
    clearFamilyDeviceAccess();
    setLocalDevice(null);
    setLocalRenameValue("");
    setCredentialMode(null);
    saveFamilyTripAuthorizationMode(null);
    setDevices([]);
    setAccessState({
      ...parsed,
      status: authState === "revoked_device_token" ? "revoked" : "unauthorized",
      authState,
      canManageDevices: false,
      canWriteSharedPlan: false,
      migrationRecommended: false,
      message: parsed.message || value.message,
    });
    setError(parsed.message || value.message);
    return true;
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
      if (
        response.authState === "revoked_device_token"
        || response.authState === "rejected_device_token"
      ) {
        clearFamilyDeviceAccess();
        setLocalDevice(null);
        setLocalRenameValue("");
        setCredentialMode(null);
        saveFamilyTripAuthorizationMode(null);
        setDevices([]);
        setError(response.message || (response.authState === "revoked_device_token"
          ? "This protected device credential was revoked. Reconnect with a new invite or select family-key recovery."
          : "This protected device credential was rejected. Reconnect with a new invite or select family-key recovery explicitly."));
      } else if (response.authState === "family_key") {
        setSuccess("This browser is connected by the family key owner path. Keep it enabled until device access is fully verified.");
      } else if (response.authState === "device_token") {
        setSuccess(response.device
          ? `${response.device.displayName} is connected by protected device credential as ${response.role}.`
          : "This browser is connected by protected device credential.");
      }
    } catch (accessError) {
      if (!disconnectRejectedDeviceCredential(accessError)) setError(errorMessage(accessError));
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
      setSuccess(summarizeFamilyTripDevices(response.devices));
    } catch (refreshError) {
      if (!disconnectRejectedDeviceCredential(refreshError)) setError(errorMessage(refreshError));
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
      if (!disconnectRejectedDeviceCredential(inviteError)) setError(errorMessage(inviteError));
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
      const acceptedDevice = loadFamilyDeviceAccess();
      setLocalDevice(acceptedDevice);
      setLocalRenameValue(acceptedDevice?.displayName || "");
      setCredentialMode("device_cookie");
      saveFamilyTripAuthorizationMode("device_cookie");
      setAccessState(response.device ? {
        status: "ok",
        authState: "device_token",
        role: response.device.role,
        device: response.device,
        canManageDevices: response.device.role === "owner",
        canWriteSharedPlan: response.device.role === "owner" || response.device.role === "editor",
        migrationRecommended: false,
        message: "This browser is connected with a protected device credential.",
      } : null);
      setAcceptToken("");
      setSuccess(response.device
        ? `${response.device.displayName} was connected in protected browser storage.`
        : "This browser was connected in protected storage.");
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
          saveFamilyDeviceAccess(nextDevice);
          const renamedDevice = loadFamilyDeviceAccess();
          setLocalDevice(renamedDevice);
          setLocalRenameValue(renamedDevice?.displayName || nextDevice.displayName);
        }
        setSuccess(`${nextDevice.displayName} was renamed.`);
      }
    } catch (renameError) {
      if (!disconnectRejectedDeviceCredential(renameError)) setError(errorMessage(renameError));
    } finally {
      setBusy(null);
    }
  }

  async function renameCurrentDevice() {
    if (!auth || !localDevice?.deviceId) return;
    const displayName = localRenameValue.trim();
    if (!displayName) {
      setError("Device name cannot be blank.");
      return;
    }

    setBusy("rename-local");
    clearMessages();
    try {
      const response = await renameFamilyTripDevice(auth, localDevice.deviceId, displayName);
      const nextDevice = response.device;
      if (nextDevice) {
        saveFamilyDeviceAccess(nextDevice);
        const renamedDevice = loadFamilyDeviceAccess();
        setLocalDevice(renamedDevice);
        setLocalRenameValue(renamedDevice?.displayName || nextDevice.displayName);
        setDevices((current) => current.map((entry) => entry.id === nextDevice.id ? nextDevice : entry));
        setRenameValues((current) => ({ ...current, [nextDevice.id]: nextDevice.displayName }));
        setSuccess(`${nextDevice.displayName} was renamed.`);
      }
    } catch (renameError) {
      if (!disconnectRejectedDeviceCredential(renameError)) setError(errorMessage(renameError));
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
          await clearProtectedFamilyDeviceAccess();
          setLocalDevice(null);
          setLocalRenameValue("");
          setCredentialMode(null);
          saveFamilyTripAuthorizationMode(null);
          setAccessState({
            status: "revoked",
            authState: "revoked_device_token",
            role: nextDevice.role,
            device: nextDevice,
            canManageDevices: false,
            canWriteSharedPlan: false,
            migrationRecommended: false,
            message: "This protected device credential was revoked. Reconnect with a new invite or use family-key recovery.",
          });
        }
        try {
          const latest = await listFamilyTripDevices(auth);
          setDevices(latest.devices);
        } catch (refreshError) {
          // The revoke response already updated the local list; a failed follow-up refresh should not hide success.
          disconnectRejectedDeviceCredential(refreshError);
        }
        setSuccess(`${nextDevice.displayName} was revoked.`);
      }
    } catch (revokeError) {
      if (!disconnectRejectedDeviceCredential(revokeError)) setError(errorMessage(revokeError));
    } finally {
      setBusy(null);
    }
  }

  async function clearLocalDevice() {
    setBusy("clear");
    clearMessages();
    try {
      await clearProtectedFamilyDeviceAccess();
      setLocalDevice(null);
      setLocalRenameValue("");
      setCredentialMode(null);
      saveFamilyTripAuthorizationMode(null);
      setAccessState(null);
      setSuccess("The protected browser credential was cleared. The server-side device record was not revoked.");
    } catch (clearError) {
      setError(errorMessage(clearError));
    } finally {
      setBusy(null);
    }
  }

  async function confirmOwnerBootstrap() {
    if (!familyKey.trim()) {
      setError("The family key is required to bootstrap the owner device.");
      return;
    }
    setBusy("bootstrap");
    clearMessages();
    try {
      const response = await bootstrapFamilyOwnerDevice(
        familyKey,
        bootstrapName.trim() || "Owner browser",
      );
      const ownerDevice = loadFamilyDeviceAccess();
      setLocalDevice(ownerDevice);
      setLocalRenameValue(ownerDevice?.displayName || "");
      setCredentialMode("device_cookie");
      saveFamilyTripAuthorizationMode("device_cookie");
      setBootstrapConfirmation(false);
      setAccessState(response.device ? {
        status: "ok",
        authState: "device_token",
        role: response.device.role,
        device: response.device,
        canManageDevices: true,
        canWriteSharedPlan: true,
        migrationRecommended: false,
        message: "This browser is connected as the protected owner device.",
      } : null);
      setSuccess(`${response.device?.displayName || "Owner device"} was established in protected browser storage.`);
    } catch (bootstrapError) {
      setError(errorMessage(bootstrapError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="family-devices">
      <summary>
        <span>Family devices</span>
        <span className="family-devices-status">
          {accessLabel(accessState, familyKey, localDevice, credentialMode)}
        </span>
      </summary>
      <div className="family-devices-content">
        <p className="muted">
          Manage device access manually. The selected protected device or family-key recovery credential is also used by shared-plan sync, history, and eligible Operations requests. CastleWatch never falls back silently, polls here, sends texts, or disables the family key.
        </p>

        {(familyKey.trim() || localDevice || credentialMode === "device_cookie") && (
          <div className="family-devices-access">
            <strong>Credential selection</strong>
            <span className="family-devices-meta">CastleWatch sends exactly one credential per device-management request and never falls back silently.</span>
            <div className="family-devices-actions">
              {(localDevice || credentialMode === "device_cookie") && (
                <button
                  className={`family-devices-button ${credentialMode === "device_cookie" ? "family-devices-button-primary" : ""}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setCredentialMode("device_cookie");
                    saveFamilyTripAuthorizationMode("device_cookie");
                    setAccessState(null);
                    clearMessages();
                  }}
                >
                  Use protected device
                </button>
              )}
              {familyKey.trim() && (
                <button
                  className={`family-devices-button ${credentialMode === "family_key" ? "family-devices-button-warning" : ""}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setCredentialMode("family_key");
                    saveFamilyTripAuthorizationMode("family_key");
                    setAccessState(null);
                    clearMessages();
                  }}
                >
                  Use family-key recovery
                </button>
              )}
            </div>
          </div>
        )}

        {familyKeyOnly && (
          <div className="family-devices-warning">
            <strong>Owner bootstrap available</strong>
            <span className="family-devices-meta">This browser can establish the first owner device through the explicit family-key recovery action below. The family key remains configured and enabled.</span>
          </div>
        )}

        {localDevice && (
          <div className="family-devices-local">
            <strong>This browser has a protected device credential</strong>
            <span className="family-devices-meta">{localDevice.displayName} · {localDevice.role} · protected {formatDate(localDevice.savedAt)}. Local storage contains safe metadata only.</span>
            {localDevice.deviceId && (
              <div className="family-devices-row">
                <input
                  className="family-devices-rename"
                  aria-label="Rename this device"
                  value={localRenameValue}
                  onChange={(event) => setLocalRenameValue(event.target.value)}
                />
                <button className="family-devices-button" type="button" disabled={disabled} onClick={() => void renameCurrentDevice()}>
                  {busy === "rename-local" ? "Renaming…" : "Rename this device"}
                </button>
              </div>
            )}
            <div className="family-devices-actions">
              <button className="family-devices-button" type="button" disabled={disabled} onClick={() => void clearLocalDevice()}>
                {busy === "clear" ? "Clearing…" : "Clear protected credential from this browser"}
              </button>
            </div>
          </div>
        )}

        {accessState && (
          <div className={accessState.authState === "revoked_device_token" ? "family-devices-message family-devices-error" : "family-devices-access"}>
            <strong>Access state: {accessLabel(accessState, familyKey, localDevice, credentialMode)}</strong>
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
          {canBootstrapOwner && (
            <div className="family-devices-card">
              <strong>Bootstrap owner device</strong>
              <span className="family-devices-meta">Use this explicit one-time recovery action only for the first active owner device, or after revoking a previous owner device. The device credential goes directly into a Secure, HttpOnly, SameSite=Strict cookie and is never displayed or written to local storage.</span>
              <div className="family-devices-fields">
                <input value={bootstrapName} onChange={(event) => setBootstrapName(event.target.value)} aria-label="Owner device name" placeholder="Owner browser" />
                <button
                  className="family-devices-button family-devices-button-warning"
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    clearMessages();
                    setBootstrapConfirmation(true);
                  }}
                >
                  Bootstrap owner
                </button>
              </div>
              {bootstrapConfirmation && (
                <div className="family-devices-revoke-confirm">
                  <strong>Confirm owner bootstrap</strong>
                  <span className="family-devices-meta">Create the protected owner credential for {bootstrapName.trim() || "Owner browser"}? The family key will remain enabled for recovery.</span>
                  <div className="family-devices-actions">
                    <button className="family-devices-button family-devices-button-primary" type="button" disabled={disabled} onClick={() => void confirmOwnerBootstrap()}>
                      {busy === "bootstrap" ? "Establishing…" : "Confirm bootstrap"}
                    </button>
                    <button className="family-devices-button" type="button" disabled={disabled} onClick={() => setBootstrapConfirmation(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="family-devices-card">
            <strong>Create invite</strong>
            <span className="family-devices-meta">Use the explicitly selected owner credential to make a 7-day editor or viewer invite for another browser or phone. Owner credentials are created only by the bootstrap action.</span>
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
            <span className="family-devices-meta">Paste an invite token here on the phone or browser you want to connect. The resulting device credential goes directly into protected server-managed cookie storage; browser JavaScript receives safe device metadata only.</span>
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
