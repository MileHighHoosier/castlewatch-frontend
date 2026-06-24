import { API_BASE_URL } from "./api";
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

export const FAMILY_KEY_STORAGE_KEY = "castlewatch.family-key.v1";

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
};

export type AppliedFamilyTrip = {
  tripProfile: TripProfile;
  reservations: TripReservation[];
  resortPlan: ResortPlan;
  approval: TripWeekApprovalState;
};

export class FamilyTripSyncError extends Error {
  statusCode: number;
  document: FamilyTripDocument | null;

  constructor(message: string, statusCode: number, document: FamilyTripDocument | null = null) {
    super(message);
    this.name = "FamilyTripSyncError";
    this.statusCode = statusCode;
    this.document = document;
  }
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
  const tripProfile = {
    ...DEFAULT_TRIP_PROFILE,
    ...(payload?.tripProfile || {}),
  };
  const reservations = Array.isArray(payload?.reservations) ? payload.reservations : [];
  const resortPlan = {
    ...DEFAULT_RESORT_PLAN,
    ...(payload?.resortPlan || {}),
  };
  const approval = {
    ...DEFAULT_TRIP_WEEK_APPROVAL,
    ...(payload?.approval || {}),
  };

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

async function parseDocument(response: Response): Promise<FamilyTripDocument> {
  const data = await response.json().catch(() => ({}));
  return {
    status: typeof data?.status === "string" ? data.status : response.ok ? "ok" : "error",
    version: Number.isInteger(data?.version) ? data.version : 0,
    payload: data?.payload && typeof data.payload === "object" ? data.payload as FamilyTripPayload : null,
    updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : null,
    message: typeof data?.message === "string" ? data.message : undefined,
  };
}

function endpoint() {
  if (!API_BASE_URL) throw new FamilyTripSyncError("CastleWatch backend URL is missing.", 0);
  return `${API_BASE_URL}/api/family-trip`;
}

export async function fetchFamilyTrip(key: string): Promise<FamilyTripDocument> {
  const response = await fetch(endpoint(), {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "X-CastleWatch-Key": key.trim(),
    },
  });
  const document = await parseDocument(response);
  if (!response.ok) {
    throw new FamilyTripSyncError(document.message || "Shared family storage could not be loaded.", response.status, document);
  }
  return document;
}

export async function saveFamilyTrip(
  key: string,
  expectedVersion: number,
  payload: FamilyTripPayload,
): Promise<FamilyTripDocument> {
  const response = await fetch(endpoint(), {
    method: "PUT",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CastleWatch-Key": key.trim(),
    },
    body: JSON.stringify({ expectedVersion, payload }),
  });
  const document = await parseDocument(response);
  if (!response.ok) {
    throw new FamilyTripSyncError(document.message || "Shared family storage could not be saved.", response.status, document);
  }
  return document;
}
