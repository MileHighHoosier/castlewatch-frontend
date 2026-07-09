export const FAMILY_DEVICE_ACCESS_STORAGE_KEY = "castlewatch.family-device-access.v1";

export type FamilyTripDeviceAuth = {
  key?: string;
  deviceToken?: string;
};

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
  deviceToken: string;
  deviceId: string | null;
  displayName: string;
  role: FamilyTripDeviceRole;
  savedAt: string;
};

export type FamilyTripDeviceAccessState = "family_key" | "device_token" | "revoked_device_token" | "unknown";

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

export type FamilyTripInviteResponse = {
  status: string;
  inviteToken: string;
  invite: FamilyTripInviteRecord | null;
  message?: string;
};

export type FamilyTripAcceptInviteResponse = {
  status: string;
  deviceToken: string;
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
    inviteToken: stringValue(root.inviteToken),
    invite: parseInvite(root.invite),
    message: typeof root.message === "string" ? root.message : undefined,
  };
}

export function parseFamilyTripAcceptInviteResponse(data: unknown): FamilyTripAcceptInviteResponse {
  const root = objectValue(data);
  return {
    status: stringValue(root.status, "error"),
    deviceToken: stringValue(root.deviceToken),
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

export function loadFamilyDeviceAccess(): StoredFamilyDeviceAccess | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FAMILY_DEVICE_ACCESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = objectValue(JSON.parse(raw));
    const deviceToken = stringValue(parsed.deviceToken).trim();
    if (!deviceToken) return null;
    return {
      deviceToken,
      deviceId: nullableString(parsed.deviceId),
      displayName: stringValue(parsed.displayName, "This device"),
      role: stringValue(parsed.role, "editor"),
      savedAt: stringValue(parsed.savedAt, new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

export function saveFamilyDeviceAccess(deviceToken: string, device?: FamilyTripDeviceRecord | null) {
  if (typeof window === "undefined") return;
  const normalized = deviceToken.trim();
  if (!normalized) {
    window.localStorage.removeItem(FAMILY_DEVICE_ACCESS_STORAGE_KEY);
    return;
  }
  const record: StoredFamilyDeviceAccess = {
    deviceToken: normalized,
    deviceId: device?.id || null,
    displayName: device?.displayName || "This device",
    role: device?.role || "editor",
    savedAt: new Date().toISOString(),
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
  rawText: string;
};

async function rawDeviceRequest(body: Record<string, unknown>): Promise<RawDeviceResponse> {
  const response = await fetch("/api/castlewatch-family-sync", {
    method: "POST",
    cache: "no-store",
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

  return { response, data, rawText };
}

function authPayload(auth: FamilyTripDeviceAuth) {
  const key = typeof auth.key === "string" ? auth.key.trim() : "";
  const deviceToken = typeof auth.deviceToken === "string" ? auth.deviceToken.trim() : "";
  return key ? { key } : { deviceToken };
}

function errorMessage(result: RawDeviceResponse, fallbackLabel: string) {
  const root = objectValue(result.data);
  return stringValue(root.message)
    || `${fallbackLabel} returned HTTP ${result.response.status}${result.rawText ? `: ${result.rawText.slice(0, 180)}` : "."}`;
}

function throwIfFailed(result: RawDeviceResponse, label: string) {
  if (!result.response.ok) {
    throw new FamilyTripDeviceError(errorMessage(result, label), result.response.status, result.data);
  }
}

export async function checkFamilyTripDeviceAccess(auth: FamilyTripDeviceAuth): Promise<FamilyTripDeviceAccessResponse> {
  const result = await rawDeviceRequest({
    action: "device_access_check",
    ...authPayload(auth),
  });
  const parsed = parseFamilyTripDeviceAccessResponse(result.data);
  if (!result.response.ok && parsed.authState !== "revoked_device_token") {
    throw new FamilyTripDeviceError(errorMessage(result, "Device access check"), result.response.status, result.data);
  }
  return parsed;
}

export async function listFamilyTripDevices(auth: FamilyTripDeviceAuth): Promise<FamilyTripDevicesResponse> {
  const result = await rawDeviceRequest({
    action: "device_list",
    ...authPayload(auth),
  });
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
  const result = await rawDeviceRequest({
    action: "device_invite_accept",
    inviteToken: inviteToken.trim(),
    deviceName: deviceName.trim(),
  });
  const parsed = parseFamilyTripAcceptInviteResponse(result.data);
  throwIfFailed(result, "Invite acceptance");
  return parsed;
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
