import {
  DEFAULT_TRIP_PROFILE,
  TripProfile,
  TripReservation,
  loadReservations,
  loadTripProfile,
  saveReservations,
  saveTripProfile,
} from "./tripProfile";
import {
  DEFAULT_RESORT_PLAN,
  ResortPlan,
  loadResortPlan,
  saveResortPlan,
} from "./tripResorts";
import {
  DEFAULT_TRIP_WEEK_APPROVAL,
  TripWeekApprovalState,
  loadTripWeekApproval,
  saveTripWeekApproval,
} from "./tripWeekApproval";
import {
  FAMILY_KEY_STORAGE_KEY,
  FamilyTripAuthorization,
  familyTripAuthorizationPayload,
  rejectProtectedDeviceAuthorization,
} from "./familyTripAuthorization";

export { FAMILY_KEY_STORAGE_KEY } from "./familyTripAuthorization";
export const FAMILY_SYNC_METADATA_STORAGE_KEY = "castlewatch.family-sync-metadata.v1";

export type FamilyTripPayload = {
  schemaVersion: 1;
  tripProfile: TripProfile;
  reservations: TripReservation[];
  resortPlan: ResortPlan;
  approval: TripWeekApprovalState;
};

export type FamilyTripDocument = {
  status: string;
  version: number;
  payload: FamilyTripPayload | null;
  updatedAt: string | null;
  message?: string;
  restoredFromVersion?: number | null;
};

export type FamilyTripHistoryEntry = {
  version: number;
  createdAt: string | null;
  restoredFromVersion: number | null;
  isCurrent: boolean;
  reservationCount: number;
  tripName: string;
  activeScenario: "base" | "alternate" | string;
  locked: boolean;
};

export type FamilyTripHistoryDocument = {
  status: string;
  currentVersion: number;
  historyLimit: number;
  entries: FamilyTripHistoryEntry[];
  message?: string;
};

export type FamilyTripHistorySnapshot = {
  status: string;
  version: number;
  payload: FamilyTripPayload;
  createdAt: string | null;
  restoredFromVersion: number | null;
  summary: {
    reservationCount: number;
    tripName: string;
    activeScenario: string;
    locked: boolean;
  };
  message?: string;
};

export type AppliedFamilyTrip = {
  tripProfile: TripProfile;
  reservations: TripReservation[];
  resortPlan: ResortPlan;
  approval: TripWeekApprovalState;
};

export type FamilyTripSyncMetadata = {
  version: number;
  baselineFingerprint: string;
  baselinePayload: FamilyTripPayload;
  syncedAt: string;
};

export type FamilyTripSyncStateId =
  | "remote_empty"
  | "baseline_required"
  | "up_to_date"
  | "local_changes"
  | "remote_changes"
  | "conflict";

export type FamilyTripSyncAnalysis = {
  id: FamilyTripSyncStateId;
  label: string;
  detail: string;
  tone: "ready" | "local" | "remote" | "warning" | "conflict";
  localChanged: boolean;
  remoteChanged: boolean;
  canUpload: boolean;
  canDownload: boolean;
};

export class FamilyTripSyncError extends Error {
  statusCode: number;
  document: FamilyTripDocument | null;

  constructor(message: string, statusCode: number, document: FamilyTripDocument | null = null) {
    super(message);
    Object.setPrototypeOf(this, FamilyTripSyncError.prototype);
    this.name = "FamilyTripSyncError";
    this.statusCode = statusCode;
    this.document = document;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
}

function simpleHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function fingerprintFamilyTripPayload(payload: FamilyTripPayload) {
  return simpleHash(JSON.stringify(canonicalize(payload)));
}

export function loadFamilyKey() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(FAMILY_KEY_STORAGE_KEY) || "";
}

export function saveFamilyKey(value: string) {
  if (typeof window === "undefined") return;
  const normalized = value.trim();
  if (normalized) window.localStorage.setItem(FAMILY_KEY_STORAGE_KEY, normalized);
  else window.localStorage.removeItem(FAMILY_KEY_STORAGE_KEY);
}

export function loadFamilySyncMetadata(): FamilyTripSyncMetadata | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FAMILY_SYNC_METADATA_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FamilyTripSyncMetadata>;
    if (
      !Number.isInteger(parsed.version)
      || (parsed.version as number) < 0
      || typeof parsed.baselineFingerprint !== "string"
      || !parsed.baselinePayload
      || typeof parsed.syncedAt !== "string"
    ) return null;
    return parsed as FamilyTripSyncMetadata;
  } catch {
    return null;
  }
}

export function saveFamilySyncMetadata(metadata: FamilyTripSyncMetadata) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FAMILY_SYNC_METADATA_STORAGE_KEY, JSON.stringify(metadata));
}

export function clearFamilySyncMetadata() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(FAMILY_SYNC_METADATA_STORAGE_KEY);
}

export function createFamilySyncMetadata(version: number, payload: FamilyTripPayload): FamilyTripSyncMetadata {
  return {
    version,
    baselineFingerprint: fingerprintFamilyTripPayload(payload),
    baselinePayload: payload,
    syncedAt: new Date().toISOString(),
  };
}

export function buildLocalFamilyTripPayload(): FamilyTripPayload {
  return {
    schemaVersion: 1,
    tripProfile: loadTripProfile(),
    reservations: loadReservations(),
    resortPlan: loadResortPlan(),
    approval: loadTripWeekApproval(),
  };
}

function normalizePayload(payload: FamilyTripPayload): AppliedFamilyTrip {
  const tripProfile = { ...DEFAULT_TRIP_PROFILE, ...(payload?.tripProfile || {}) };
  const reservations = Array.isArray(payload?.reservations) ? payload.reservations : [];
  const resortPlan = { ...DEFAULT_RESORT_PLAN, ...(payload?.resortPlan || {}) };
  const approval = { ...DEFAULT_TRIP_WEEK_APPROVAL, ...(payload?.approval || {}) };

  if (approval.activeScenario !== "base" && approval.activeScenario !== "alternate") {
    approval.activeScenario = "base";
  }
  if (approval.previousScenario !== "base" && approval.previousScenario !== "alternate") {
    approval.previousScenario = null;
  }

  return { tripProfile, reservations, resortPlan, approval };
}

export function applyFamilyTripPayload(payload: FamilyTripPayload): AppliedFamilyTrip {
  const normalized = normalizePayload(payload);
  saveTripProfile(normalized.tripProfile);
  saveReservations(normalized.reservations);
  saveResortPlan(normalized.resortPlan);
  saveTripWeekApproval(normalized.approval);
  return normalized;
}

export function analyzeFamilyTripSync(
  localPayload: FamilyTripPayload,
  remote: FamilyTripDocument,
  metadata: FamilyTripSyncMetadata | null,
): FamilyTripSyncAnalysis {
  const localFingerprint = fingerprintFamilyTripPayload(localPayload);

  if (remote.version === 0 || !remote.payload) {
    return {
      id: "remote_empty",
      label: "Ready for first upload",
      detail: "No shared family plan exists yet. Uploading will establish this device as version 1.",
      tone: "warning",
      localChanged: true,
      remoteChanged: false,
      canUpload: true,
      canDownload: false,
    };
  }

  if (!metadata) {
    const remoteFingerprint = fingerprintFamilyTripPayload(remote.payload);
    if (remoteFingerprint === localFingerprint) {
      return {
        id: "up_to_date",
        label: "Up to date",
        detail: `This device matches shared version ${remote.version}.`,
        tone: "ready",
        localChanged: false,
        remoteChanged: false,
        canUpload: false,
        canDownload: false,
      };
    }
    return {
      id: "baseline_required",
      label: "Choose a baseline",
      detail: "This device and the shared plan differ, but CastleWatch has no prior sync point for this browser. Choose which copy should become the baseline.",
      tone: "warning",
      localChanged: true,
      remoteChanged: true,
      canUpload: true,
      canDownload: true,
    };
  }

  const localChanged = localFingerprint !== metadata.baselineFingerprint;
  const remoteChanged = remote.version !== metadata.version;

  if (!localChanged && !remoteChanged) {
    return {
      id: "up_to_date",
      label: "Up to date",
      detail: `Local data matches shared version ${remote.version}.`,
      tone: "ready",
      localChanged,
      remoteChanged,
      canUpload: false,
      canDownload: false,
    };
  }

  if (localChanged && !remoteChanged) {
    return {
      id: "local_changes",
      label: "Local changes not uploaded",
      detail: `This browser changed after version ${metadata.version}. The shared plan has not changed.`,
      tone: "local",
      localChanged,
      remoteChanged,
      canUpload: true,
      canDownload: true,
    };
  }

  if (!localChanged && remoteChanged) {
    return {
      id: "remote_changes",
      label: "Newer shared version available",
      detail: `This browser is based on version ${metadata.version}; shared version ${remote.version} is available.`,
      tone: "remote",
      localChanged,
      remoteChanged,
      canUpload: false,
      canDownload: true,
    };
  }

  return {
    id: "conflict",
    label: "Sync conflict",
    detail: `This browser changed after version ${metadata.version}, and shared version ${remote.version} also changed. Upload is blocked to prevent overwriting the other copy.`,
    tone: "conflict",
    localChanged,
    remoteChanged,
    canUpload: false,
    canDownload: true,
  };
}

type RawSyncResponse = {
  response: Response;
  data: any;
};

async function rawSyncRequest(
  body: Record<string, unknown>,
  authorization: FamilyTripAuthorization,
): Promise<RawSyncResponse> {
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
  rejectProtectedDeviceAuthorization(authorization, response.status);
  const rawText = await response.text();
  let data: any = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }
  return { response, data };
}

function fallbackMessage(response: Response, label: string) {
  return `${label} returned HTTP ${response.status}.`;
}

function parseDocument(result: RawSyncResponse): FamilyTripDocument {
  const { response, data } = result;
  return {
    status: typeof data?.status === "string" ? data.status : response.ok ? "ok" : "error",
    version: Number.isInteger(data?.version) ? data.version : 0,
    payload: data?.payload && typeof data.payload === "object" ? data.payload as FamilyTripPayload : null,
    updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : null,
    message: typeof data?.message === "string" ? data.message : response.ok ? undefined : fallbackMessage(response, "Family sync"),
    restoredFromVersion: Number.isInteger(data?.restoredFromVersion) ? data.restoredFromVersion : null,
  };
}

export async function fetchFamilyTrip(authorization: FamilyTripAuthorization): Promise<FamilyTripDocument> {
  const result = await rawSyncRequest({
    action: "read",
    ...familyTripAuthorizationPayload(authorization),
  }, authorization);
  const document = parseDocument(result);
  if (!result.response.ok) {
    throw new FamilyTripSyncError(document.message || `Shared family storage could not be loaded (HTTP ${result.response.status}).`, result.response.status, document);
  }
  return document;
}

export async function saveFamilyTrip(
  authorization: FamilyTripAuthorization,
  expectedVersion: number,
  payload: FamilyTripPayload,
): Promise<FamilyTripDocument> {
  const result = await rawSyncRequest({
    action: "write",
    ...familyTripAuthorizationPayload(authorization),
    expectedVersion,
    payload,
  }, authorization);
  const document = parseDocument(result);
  if (!result.response.ok) {
    throw new FamilyTripSyncError(document.message || `Shared family storage could not be saved (HTTP ${result.response.status}).`, result.response.status, document);
  }
  return document;
}

export async function createContentIdenticalFamilyTripBackup(
  authorization: FamilyTripAuthorization,
  current: FamilyTripDocument,
): Promise<FamilyTripDocument> {
  if (current.version < 1 || !current.payload) {
    throw new Error("A current shared plan is required before creating a manual backup.");
  }
  const saved = await saveFamilyTrip(authorization, current.version, current.payload);
  if (
    !saved.payload
    || fingerprintFamilyTripPayload(saved.payload) !== fingerprintFamilyTripPayload(current.payload)
  ) {
    throw new Error("The manual backup response did not preserve the shared trip payload.");
  }
  return saved;
}

export async function fetchFamilyTripHistory(authorization: FamilyTripAuthorization): Promise<FamilyTripHistoryDocument> {
  const result = await rawSyncRequest({
    action: "history",
    ...familyTripAuthorizationPayload(authorization),
  }, authorization);
  const data = result.data;
  const history: FamilyTripHistoryDocument = {
    status: typeof data?.status === "string" ? data.status : result.response.ok ? "ok" : "error",
    currentVersion: Number.isInteger(data?.currentVersion) ? data.currentVersion : 0,
    historyLimit: Number.isInteger(data?.historyLimit) ? data.historyLimit : 25,
    entries: Array.isArray(data?.entries) ? data.entries as FamilyTripHistoryEntry[] : [],
    message: typeof data?.message === "string" ? data.message : result.response.ok ? undefined : fallbackMessage(result.response, "Family history"),
  };
  if (!result.response.ok) {
    throw new FamilyTripSyncError(history.message || `Shared history could not be loaded (HTTP ${result.response.status}).`, result.response.status);
  }
  return history;
}

export async function fetchFamilyTripHistoryVersion(
  authorization: FamilyTripAuthorization,
  version: number,
): Promise<FamilyTripHistorySnapshot> {
  const result = await rawSyncRequest({
    action: "history_version",
    ...familyTripAuthorizationPayload(authorization),
    version,
  }, authorization);
  const data = result.data;
  if (!result.response.ok || !data?.payload) {
    const message = typeof data?.message === "string"
      ? data.message
      : fallbackMessage(result.response, "History version");
    throw new FamilyTripSyncError(message, result.response.status);
  }
  return {
    status: typeof data?.status === "string" ? data.status : "ok",
    version: Number.isInteger(data?.version) ? data.version : version,
    payload: data.payload as FamilyTripPayload,
    createdAt: typeof data?.createdAt === "string" ? data.createdAt : null,
    restoredFromVersion: Number.isInteger(data?.restoredFromVersion) ? data.restoredFromVersion : null,
    summary: {
      reservationCount: Number.isInteger(data?.summary?.reservationCount) ? data.summary.reservationCount : 0,
      tripName: typeof data?.summary?.tripName === "string" ? data.summary.tripName : "Family trip",
      activeScenario: typeof data?.summary?.activeScenario === "string" ? data.summary.activeScenario : "base",
      locked: Boolean(data?.summary?.locked),
    },
  };
}

export async function restoreFamilyTripVersion(
  authorization: FamilyTripAuthorization,
  expectedVersion: number,
  sourceVersion: number,
): Promise<FamilyTripDocument> {
  const result = await rawSyncRequest({
    action: "restore",
    ...familyTripAuthorizationPayload(authorization),
    expectedVersion,
    sourceVersion,
  }, authorization);
  const document = parseDocument(result);
  if (!result.response.ok) {
    throw new FamilyTripSyncError(document.message || `Shared history could not be restored (HTTP ${result.response.status}).`, result.response.status, document);
  }
  return document;
}
