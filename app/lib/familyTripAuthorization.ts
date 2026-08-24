import { loadFamilyDeviceAccess } from "./familyTripDevices";

export const FAMILY_KEY_STORAGE_KEY = "castlewatch.family-key.v1";
export const FAMILY_AUTHORIZATION_MODE_STORAGE_KEY = "castlewatch.family-authorization-mode.v1";
export const FAMILY_AUTHORIZATION_UPDATED_EVENT = "castlewatch-family-authorization-updated";

export type FamilyTripRole = "owner" | "editor" | "viewer";
export type FamilyTripAuthorizationMode = "family_key" | "device_cookie";
export type FamilyTripAuthorizationSelection = FamilyTripAuthorizationMode | "disconnected";

export type FamilyTripAuthorization =
  | {
    mode: "family_key";
    key: string;
    role: "owner";
    label: "Family key";
  }
  | {
    mode: "device_cookie";
    role: FamilyTripRole;
    label: string;
    deviceId: string | null;
  };

export function normalizeFamilyTripRole(value: unknown): FamilyTripRole {
  if (value === "owner" || value === "editor" || value === "viewer") return value;
  return "viewer";
}

export function familyTripAuthorizationPayload(authorization: FamilyTripAuthorization) {
  if (authorization.mode === "family_key") {
    const key = authorization.key.trim();
    if (!key) throw new Error("The CastleWatch family key is missing.");
    return { authMode: "family_key" as const, key };
  }
  return { authMode: "device_cookie" as const };
}

export function canReadFamilyTrip(_authorization: FamilyTripAuthorization) {
  return true;
}

export function canWriteFamilyTrip(authorization: FamilyTripAuthorization) {
  return authorization.role === "owner" || authorization.role === "editor";
}

export function canRestoreFamilyTrip(authorization: FamilyTripAuthorization) {
  return canWriteFamilyTrip(authorization);
}

export function canViewFamilyTripOperations(authorization: FamilyTripAuthorization) {
  return authorization.role === "owner" || authorization.role === "editor";
}

export function familyTripAuthorizationDescription(authorization: FamilyTripAuthorization) {
  if (authorization.mode === "family_key") return "Family key · owner";
  return `${authorization.label} · ${authorization.role}`;
}

export function loadFamilyTripAuthorizationMode(): FamilyTripAuthorizationMode | null {
  const selection = loadFamilyTripAuthorizationSelection();
  return selection === "family_key" || selection === "device_cookie" ? selection : null;
}

export function loadFamilyTripAuthorizationSelection(): FamilyTripAuthorizationSelection | null {
  if (typeof window === "undefined") return null;
  const selection = window.localStorage.getItem(FAMILY_AUTHORIZATION_MODE_STORAGE_KEY);
  return selection === "family_key" || selection === "device_cookie" || selection === "disconnected"
    ? selection
    : null;
}

export function saveFamilyTripAuthorizationMode(mode: FamilyTripAuthorizationMode | null) {
  if (typeof window === "undefined") return;
  const selection: FamilyTripAuthorizationSelection = mode || "disconnected";
  if (loadFamilyTripAuthorizationSelection() === selection) return;
  window.localStorage.setItem(FAMILY_AUTHORIZATION_MODE_STORAGE_KEY, selection);
  if (typeof window.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent(FAMILY_AUTHORIZATION_UPDATED_EVENT));
  }
}

export function sameFamilyTripAuthorization(
  first: FamilyTripAuthorization | null,
  second: FamilyTripAuthorization | null,
) {
  if (!first || !second) return first === second;
  if (first.mode !== second.mode || first.role !== second.role) return false;
  if (first.mode === "family_key" && second.mode === "family_key") {
    return first.key === second.key;
  }
  if (first.mode === "device_cookie" && second.mode === "device_cookie") {
    return first.deviceId === second.deviceId;
  }
  return false;
}

export function familyKeyAuthorization(value: string): FamilyTripAuthorization | null {
  const key = value.trim();
  return key ? { mode: "family_key", key, role: "owner", label: "Family key" } : null;
}

export function protectedDeviceAuthorization(): FamilyTripAuthorization | null {
  const device = loadFamilyDeviceAccess();
  if (!device) return null;
  return {
    mode: "device_cookie",
    role: normalizeFamilyTripRole(device.role),
    label: device.displayName || "Protected device",
    deviceId: device.deviceId,
  };
}

export function loadFamilyTripAuthorization(): FamilyTripAuthorization | null {
  if (typeof window === "undefined") return null;
  const selectedMode = loadFamilyTripAuthorizationSelection();
  const keyAuthorization = familyKeyAuthorization(
    window.localStorage.getItem(FAMILY_KEY_STORAGE_KEY) || "",
  );
  const deviceAuthorization = protectedDeviceAuthorization();

  if (selectedMode === "disconnected") return null;
  if (selectedMode === "family_key") return keyAuthorization;
  if (selectedMode === "device_cookie") return deviceAuthorization;
  return deviceAuthorization || keyAuthorization;
}
