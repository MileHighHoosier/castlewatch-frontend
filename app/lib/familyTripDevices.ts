export const FAMILY_DEVICE_ACCESS_STORAGE_KEY = "castlewatch.family-device-access.v1";

const MAX_CREDENTIAL_LENGTH = 512;

export type FamilyTripDeviceAuth =
  | { mode: "family_key"; key: string }
  | { mode: "device_cookie" };

export type FamilyTripDeviceRole = "owner" | "editor" | "viewer" | string;

export type FamilyTripDeviceRecord = {
  id: string;
  displayName: string;
  role: FamilyTripDeviceRole;
  status: string;
  tokenPrefix: string;
  createdAt: string | null;
  lastSeenAt: string | null;
  lastReadAt: string | null;
  lastWriteAt: string | null;
  revokedAt: string | null;
};

export type FamilyTripInviteRecord = {
  id: string;
  role: "editor" | "viewer" | string;
  status: string;
  invitePrefix: string;
  label: string;
  expiresAt: string | null;
  createdAt: string | null;
  acceptedAt: string | null;
};

export type StoredFamilyDeviceAccess = {
  deviceId: string | null;
  displayName: string;
  role: FamilyTripDeviceRole;
  savedAt: string;
  storage: "protected_cookie";
};

type LegacyStoredFamilyDeviceAccess = Omit<StoredFamilyDeviceAccess, "storage"> & {
  deviceToken: string;
};

let legacyMigrationInFlight: Promise<FamilyTripDeviceAccessResponse | null> | null = null;

export type FamilyTripDeviceAccessState =
  | "family_key"
  | "device_token"
  | "revoked_device_token"
  | "rejected_device_token"
  | "unknown";

export type FamilyTripDeviceAccessResponse = {
  status: string;
  authState: FamilyTripDeviceAccessState;
  role: FamilyTripDeviceRole;
  device: FamilyTripDeviceRecord | null;
  canManageDevices: boolean;
  canWriteSharedPlan: boolean;
  migrationRecommended: boolean;
  message?: string;
};

export type FamilyTripDevicesResponse = {
  status: string;
  devices: FamilyTripDeviceRecord[];
  message?: string;
};

export function summarizeFamilyTripDevices(devices: FamilyTripDeviceRecord[]) {
  if (devices.length === 0) return "No device records are listed yet.";

  const activeCount = devices.filter((device) => device.status === "active").length;
  const revokedCount = devices.filter((device) => device.status === "revoked").length;
  const otherCount = devices.length - activeCount - revokedCount;
  const counts = [`${activeCount} active`];
  if (revokedCount > 0) counts.push(`${revokedCount} revoked`);
  if (otherCount > 0) counts.push(`${otherCount} other`);

  return `Loaded ${devices.length} device record${devices.length === 1 ? "" : "s"}: ${counts.join(", ")}.`;
}

export type FamilyTripInviteResponse = {
  status: string;
  inviteToken: string;
  invite: FamilyTripInviteRecord | null;
  message?: string;
};

export type FamilyTripAcceptInviteResponse = {
  status: string;
  device: FamilyTripDeviceRecord | null;
  message?: string;
};

export type FamilyTripDeviceResponse = {
  status: string;
  device: FamilyTripDeviceRecord | null;
  message?: string;
};

export class FamilyTripDeviceError extends Error {
  statusCode: number;
  payload: unknown;

  constructor(message: string, statusCode: number, payload: unknown = null) {
    super(message);
    Object.setPrototypeOf(this, FamilyTripDeviceError.prototype);
    this.name = "FamilyTripDeviceError";
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

function objectValue(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function normalizeCredentialToken(value: unknown, expectedPrefix: "cwdev_" | "cwinv_") {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_CREDENTIAL_LENGTH) return "";
  if (!normalized.startsWith(expectedPrefix)) return "";
  if (/\s/.test(normalized) || /[\u0000-\u001f\u007f]/.test(normalized)) return "";
  return normalized;
}

function parseDevice(value: unknown): FamilyTripDeviceRecord | null {
  const record = objectValue(value);
  const id = stringValue(record.id);
  if (!id) return null;
  return {
    id,
    displayName: stringValue(record.displayName, "Unnamed device"),
    role: stringValue(record.role, "viewer"),
    status: stringValue(record.status, "unknown"),
    tokenPrefix: stringValue(record.tokenPrefix),
    createdAt: nullableString(record.createdAt),
    lastSeenAt: nullableString(record.lastSeenAt),
    lastReadAt: nullableString(record.lastReadAt),
    lastWriteAt: nullableString(record.lastWriteAt),
    revokedAt: nullableString(record.revokedAt),
  };
}

function parseInvite(value: unknown): FamilyTripInviteRecord | null {
  const record = objectValue(value);
  const id = stringValue(record.id);
  if (!id) return null;
  return {
    id,
    role: stringValue(record.role, "viewer"),
    status: stringValue(record.status, "unknown"),
    invitePrefix: stringValue(record.invitePrefix),
    label: stringValue(record.label, "Invite"),
    expiresAt: nullableString(record.expiresAt),
    createdAt: nullableString(record.createdAt),
    acceptedAt: nullableString(record.acceptedAt),
  };
}

export function parseFamilyTripDeviceAccessResponse(data: unknown): FamilyTripDeviceAccessResponse {
  const root = objectValue(data);
  const authState = stringValue(root.authState, "unknown") as FamilyTripDeviceAccessState;
  return {
    status: stringValue(root.status, "error"),
    authState,
    role: stringValue(root.role, root.device && typeof root.device === "object" ? stringValue((root.device as Record<string, unknown>).role, "") : ""),
    device: parseDevice(root.device),
    canManageDevices: booleanValue(root.canManageDevices),
    canWriteSharedPlan: booleanValue(root.canWriteSharedPlan),
    migrationRecommended: booleanValue(root.migrationRecommended),
    message: typeof root.message === "string" ? root.message : undefined,
  };
}

export function parseFamilyTripDevicesResponse(data: unknown): FamilyTripDevicesResponse {
  const root = objectValue(data);
  return {
    status: stringValue(root.status, "error"),
    devices: Array.isArray(root.devices) ? root.devices.flatMap((entry) => {
      const device = parseDevice(entry);
      return device ? [device] : [];
    }) : [],
    message: typeof root.message === "string" ? root.message : undefined,
  };
}

export function parseFamilyTripInviteResponse(data: unknown): FamilyTripInviteResponse {
  const root = objectValue(data);
  return {
    status: stringValue(root.status, "error"),
    inviteToken: normalizeCredentialToken(root.inviteToken, "cwinv_"),
    invite: parseInvite(root.invite),
    message: typeof root.message === "string" ? root.message : undefined,
  };
}

export function parseFamilyTripAcceptInviteResponse(data: unknown): FamilyTripAcceptInviteResponse {
  const root = objectValue(data);
  return {
    status: stringValue(root.status, "error"),
    device: parseDevice(root.device),
    message: typeof root.message === "string" ? root.message : undefined,
  };
}

export function parseFamilyTripDeviceResponse(data: unknown): FamilyTripDeviceResponse {
  const root = objectValue(data);
  return {
    status: stringValue(root.status, "error"),
    device: parseDevice(root.device),
    message: typeof root.message === "string" ? root.message : undefined,
  };
}

function readStorageRecord() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FAMILY_DEVICE_ACCESS_STORAGE_KEY);
    return raw ? objectValue(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function storedMetadata(record: Record<string, any>): StoredFamilyDeviceAccess {
  return {
    deviceId: nullableString(record.deviceId),
    displayName: stringValue(record.displayName, "This device"),
    role: stringValue(record.role, "editor"),
    savedAt: stringValue(record.savedAt, new Date().toISOString()),
    storage: "protected_cookie",
  };
}

function loadLegacyFamilyDeviceAccess(): LegacyStoredFamilyDeviceAccess | null {
  const parsed = readStorageRecord();
  if (!parsed) return null;
  const deviceToken = normalizeCredentialToken(parsed.deviceToken, "cwdev_");
  if (!deviceToken) return null;
  const metadata = storedMetadata(parsed);
  return {
    deviceToken,
    deviceId: metadata.deviceId,
    displayName: metadata.displayName,
    role: metadata.role,
    savedAt: metadata.savedAt,
  };
}

export function hasLegacyFamilyDeviceAccess() {
  return Boolean(loadLegacyFamilyDeviceAccess());
}

export function loadFamilyDeviceAccess(): StoredFamilyDeviceAccess | null {
  const parsed = readStorageRecord();
  if (!parsed) return null;
  return parsed.storage === "protected_cookie" ? storedMetadata(parsed) : null;
}

export function saveFamilyDeviceAccess(device: FamilyTripDeviceRecord) {
  if (typeof window === "undefined") return;
  const record: StoredFamilyDeviceAccess = {
    deviceId: device.id,
    displayName: device.displayName || "This device",
    role: device.role || "editor",
    savedAt: new Date().toISOString(),
    storage: "protected_cookie",
  };
  window.localStorage.setItem(FAMILY_DEVICE_ACCESS_STORAGE_KEY, JSON.stringify(record));
}

export function clearFamilyDeviceAccess() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(FAMILY_DEVICE_ACCESS_STORAGE_KEY);
}

type RawDeviceResponse = {
  response: Response;
  data: unknown;
};

async function rawDeviceRequest(body: Record<string, unknown>): Promise<RawDeviceResponse> {
  const response = await fetch("/api/castlewatch-family-sync", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  let data: unknown = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }

  return { response, data };
}

function authPayload(auth: FamilyTripDeviceAuth) {
  if (auth.mode === "family_key") {
    const key = auth.key.trim();
    if (!key) throw new FamilyTripDeviceError("The family key is missing.", 400);
    return { authMode: "family_key", key };
  }
  return { authMode: "device_cookie" };
}

function errorMessage(result: RawDeviceResponse, fallbackLabel: string) {
  const root = objectValue(result.data);
  return stringValue(root.message)
    || `${fallbackLabel} returned HTTP ${result.response.status}.`;
}

function throwIfFailed(result: RawDeviceResponse, label: string) {
  if (!result.response.ok) {
    throw new FamilyTripDeviceError(errorMessage(result, label), result.response.status, result.data);
  }
}

export async function checkFamilyTripDeviceAccess(auth: FamilyTripDeviceAuth): Promise<FamilyTripDeviceAccessResponse> {
  const result = await rawDeviceRequest({ action: "device_access_check", ...authPayload(auth) });
  const parsed = parseFamilyTripDeviceAccessResponse(result.data);
  if (
    !result.response.ok
    && parsed.authState !== "revoked_device_token"
    && parsed.authState !== "rejected_device_token"
  ) {
    throw new FamilyTripDeviceError(errorMessage(result, "Device access check"), result.response.status, result.data);
  }
  return parsed;
}

export async function listFamilyTripDevices(auth: FamilyTripDeviceAuth): Promise<FamilyTripDevicesResponse> {
  const result = await rawDeviceRequest({ action: "device_list", ...authPayload(auth) });
  const parsed = parseFamilyTripDevicesResponse(result.data);
  throwIfFailed(result, "Device list");
  return parsed;
}

export async function createFamilyTripInvite(
  auth: FamilyTripDeviceAuth,
  input: { role?: "editor" | "viewer"; label?: string } = {},
): Promise<FamilyTripInviteResponse> {
  const result = await rawDeviceRequest({
    action: "device_invite_create",
    ...authPayload(auth),
    role: input.role,
    label: input.label,
  });
  const parsed = parseFamilyTripInviteResponse(result.data);
  throwIfFailed(result, "Invite creation");
  return parsed;
}

export async function acceptFamilyTripInvite(
  inviteToken: string,
  deviceName: string,
): Promise<FamilyTripAcceptInviteResponse> {
  const normalizedInviteToken = normalizeCredentialToken(inviteToken, "cwinv_");
  if (!normalizedInviteToken) {
    throw new FamilyTripDeviceError("Invite token format is invalid.", 400);
  }
  const result = await rawDeviceRequest({
    action: "device_invite_accept",
    inviteToken: normalizedInviteToken,
    deviceName: deviceName.trim(),
  });
  const parsed = parseFamilyTripAcceptInviteResponse(result.data);
  throwIfFailed(result, "Invite acceptance");
  if (!parsed.device) {
    throw new FamilyTripDeviceError("Invite acceptance did not return safe device metadata.", 502, result.data);
  }
  saveFamilyDeviceAccess(parsed.device);
  return parsed;
}

export async function bootstrapFamilyOwnerDevice(
  familyKey: string,
  deviceName: string,
): Promise<FamilyTripDeviceResponse> {
  const key = familyKey.trim();
  if (!key) throw new FamilyTripDeviceError("The family key is missing.", 400);
  const result = await rawDeviceRequest({
    action: "device_owner_bootstrap",
    authMode: "family_key",
    key,
    deviceName: deviceName.trim(),
  });
  const parsed = parseFamilyTripDeviceResponse(result.data);
  throwIfFailed(result, "Owner device bootstrap");
  if (!parsed.device) {
    throw new FamilyTripDeviceError("Owner bootstrap did not return safe device metadata.", 502, result.data);
  }
  saveFamilyDeviceAccess(parsed.device);
  return parsed;
}

export function migrateLegacyFamilyDeviceAccess(): Promise<FamilyTripDeviceAccessResponse | null> {
  if (legacyMigrationInFlight) return legacyMigrationInFlight;

  legacyMigrationInFlight = (async () => {
    const legacy = loadLegacyFamilyDeviceAccess();
    if (!legacy) return null;

    const result = await rawDeviceRequest({
      action: "device_credential_migrate",
      deviceToken: legacy.deviceToken,
    });
    const parsed = parseFamilyTripDeviceAccessResponse(result.data);
    throwIfFailed(result, "Protected credential migration");
    if (parsed.authState !== "device_token" || !parsed.device) {
      throw new FamilyTripDeviceError("Protected credential migration was not acknowledged by the server.", 502, result.data);
    }
    saveFamilyDeviceAccess(parsed.device);
    return parsed;
  })();

  return legacyMigrationInFlight.finally(() => {
    legacyMigrationInFlight = null;
  });
}

export async function clearProtectedFamilyDeviceAccess() {
  const result = await rawDeviceRequest({ action: "device_credential_clear" });
  throwIfFailed(result, "Protected credential clear");
  clearFamilyDeviceAccess();
}

export async function renameFamilyTripDevice(
  auth: FamilyTripDeviceAuth,
  deviceId: string,
  displayName: string,
): Promise<FamilyTripDeviceResponse> {
  const result = await rawDeviceRequest({
    action: "device_rename",
    ...authPayload(auth),
    deviceId,
    displayName: displayName.trim(),
  });
  const parsed = parseFamilyTripDeviceResponse(result.data);
  throwIfFailed(result, "Device rename");
  return parsed;
}

export async function revokeFamilyTripDevice(
  auth: FamilyTripDeviceAuth,
  deviceId: string,
): Promise<FamilyTripDeviceResponse> {
  const result = await rawDeviceRequest({
    action: "device_revoke",
    ...authPayload(auth),
    deviceId,
  });
  const parsed = parseFamilyTripDeviceResponse(result.data);
  throwIfFailed(result, "Device revoke");
  return parsed;
}
