import { calendarDay, TRIP_TIME_ZONE } from "./tripDate";

export type BookingTargetType = "dining" | "experience" | "tour" | "other";
export type BookingTargetPriority = "must_do" | "high" | "standard" | "low";
export type BookingTargetStatus = "planned" | "attempted" | "booked" | "unavailable" | "backup";
export type BookingRuleVerification = "verified" | "needs_verification" | "unavailable";

export type BookingRuleProvenance = {
  source: string;
  sourceUrl: string | null;
  asOfDate: string | null;
};

export type BookingWindowRule = {
  provenance: BookingRuleProvenance;
  verification: BookingRuleVerification;
  openingDaysBeforeTrip: number | null;
  deadlineDaysBeforeTrip: number | null;
};

export type BookingWindowOverride = {
  openingDate: string | null;
  deadlineDate: string | null;
  note: string;
};

export type BookingTarget = {
  [key: string]: unknown;
  id: string;
  title: string;
  targetType: BookingTargetType;
  priority: BookingTargetPriority;
  desiredTripDate: string;
  status: BookingTargetStatus;
  bookingRule: BookingWindowRule | null;
  manualOverride: BookingWindowOverride | null;
  linkedReservationId: string | null;
  notes: string;
};

export type BookingWindowDateStatus = "ready" | "needs_verification" | "unavailable" | "invalid";

export type BookingWindowDate = {
  date: string | null;
  source: "calculated" | "manual_override" | "none";
  status: BookingWindowDateStatus;
  detail: string;
};

export type BookingWindowResult = {
  targetId: string | null;
  desiredTripDate: string | null;
  planningTimeZone: typeof TRIP_TIME_ZONE;
  ruleProvenance: BookingRuleProvenance | null;
  ruleVerification: BookingRuleVerification;
  opening: BookingWindowDate;
  deadline: BookingWindowDate;
};

export const BOOKING_TARGETS_STORAGE_KEY = "castlewatch.booking-targets.v1";

const TARGET_TYPES: BookingTargetType[] = ["dining", "experience", "tour", "other"];
const TARGET_PRIORITIES: BookingTargetPriority[] = ["must_do", "high", "standard", "low"];
const TARGET_STATUSES: BookingTargetStatus[] = ["planned", "attempted", "booked", "unavailable", "backup"];
const RULE_VERIFICATIONS: BookingRuleVerification[] = ["verified", "needs_verification", "unavailable"];

function isDateOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && calendarDay(value) !== null);
}

function isOffsetOrNull(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 3660);
}

function isBookingRuleProvenance(value: unknown): value is BookingRuleProvenance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.source === "string"
    && (row.sourceUrl === null || typeof row.sourceUrl === "string")
    && isDateOrNull(row.asOfDate);
}

export function isBookingWindowRule(value: unknown): value is BookingWindowRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return isBookingRuleProvenance(row.provenance)
    && RULE_VERIFICATIONS.includes(row.verification as BookingRuleVerification)
    && isOffsetOrNull(row.openingDaysBeforeTrip)
    && isOffsetOrNull(row.deadlineDaysBeforeTrip);
}

function isBookingWindowOverride(value: unknown): value is BookingWindowOverride {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return isDateOrNull(row.openingDate)
    && isDateOrNull(row.deadlineDate)
    && typeof row.note === "string";
}

export function isBookingTarget(value: unknown): value is BookingTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string"
    && Boolean(row.id.trim())
    && typeof row.title === "string"
    && Boolean(row.title.trim())
    && TARGET_TYPES.includes(row.targetType as BookingTargetType)
    && TARGET_PRIORITIES.includes(row.priority as BookingTargetPriority)
    && (row.desiredTripDate === "" || (typeof row.desiredTripDate === "string" && calendarDay(row.desiredTripDate) !== null))
    && TARGET_STATUSES.includes(row.status as BookingTargetStatus)
    && (row.bookingRule === null || isBookingWindowRule(row.bookingRule))
    && (row.manualOverride === null || isBookingWindowOverride(row.manualOverride))
    && (row.linkedReservationId === null || typeof row.linkedReservationId === "string")
    && typeof row.notes === "string";
}

export function validBookingTargetCollection(value: unknown): value is BookingTarget[] {
  return Array.isArray(value)
    && value.every(isBookingTarget)
    && new Set(value.map((row) => row.id)).size === value.length;
}

export function normalizeBookingTargets(value: unknown): BookingTarget[] {
  return validBookingTargetCollection(value) ? value : [];
}

export function loadRawBookingTargets(): unknown {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(BOOKING_TARGETS_STORAGE_KEY);
    return stored === null ? undefined : JSON.parse(stored);
  } catch {
    return null;
  }
}

export function loadBookingTargets(): BookingTarget[] {
  return normalizeBookingTargets(loadRawBookingTargets());
}

export function saveBookingTargets(targets: BookingTarget[]) {
  if (!validBookingTargetCollection(targets)) {
    throw new Error("Invalid booking-target data. Original stored data has not been changed.");
  }
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BOOKING_TARGETS_STORAGE_KEY, JSON.stringify(targets));
}

export function updateBookingTargets(
  change: (current: BookingTarget[]) => BookingTarget[],
): BookingTarget[] {
  const raw = loadRawBookingTargets();
  let current: BookingTarget[];
  if (raw === undefined) {
    current = [];
  } else if (validBookingTargetCollection(raw)) {
    current = raw;
  } else {
    throw new Error("Stored booking-target data changed to an unsupported shape. Nothing was saved.");
  }

  const next = change(current);
  saveBookingTargets(next);
  return next;
}

export function replaceRawBookingTargets(value: unknown, present: boolean) {
  if (typeof window === "undefined") return;
  if (present) window.localStorage.setItem(BOOKING_TARGETS_STORAGE_KEY, JSON.stringify(value));
  else window.localStorage.removeItem(BOOKING_TARGETS_STORAGE_KEY);
}

function shiftCalendarDate(value: string, days: number): string | null {
  const date = calendarDay(value);
  if (date === null || !Number.isInteger(days)) return null;
  return new Date(date + days * 86_400_000).toISOString().slice(0, 10);
}

function unavailableDate(detail: string, status: BookingWindowDateStatus = "unavailable"): BookingWindowDate {
  return { date: null, source: "none", status, detail };
}

function resolveWindowDate(
  label: "opening" | "deadline",
  desiredTripDate: string,
  overrideDate: string | null,
  offset: number | null,
  verification: BookingRuleVerification,
): BookingWindowDate {
  if (overrideDate) {
    return {
      date: overrideDate,
      source: "manual_override",
      status: "ready",
      detail: `Using the family's manual ${label} date.`,
    };
  }
  if (calendarDay(desiredTripDate) === null) {
    return unavailableDate(`Add a valid desired trip date before calculating the ${label} date.`, "invalid");
  }
  if (verification === "unavailable" || offset === null) {
    return unavailableDate(`No ${label} date is available from the current rule.`);
  }
  const date = shiftCalendarDate(desiredTripDate, -offset);
  if (!date) return unavailableDate(`The ${label} date could not be calculated.`, "invalid");
  return {
    date,
    source: "calculated",
    status: verification === "verified" ? "ready" : "needs_verification",
    detail: verification === "verified"
      ? `Calculated ${offset} day${offset === 1 ? "" : "s"} before the desired trip date.`
      : `Calculated from an unverified ${offset}-day assumption; verify the rule before relying on this date.`,
  };
}

export function calculateBookingWindow(value: unknown): BookingWindowResult {
  if (!isBookingTarget(value)) {
    return {
      targetId: null,
      desiredTripDate: null,
      planningTimeZone: TRIP_TIME_ZONE,
      ruleProvenance: null,
      ruleVerification: "unavailable",
      opening: unavailableDate("The booking target is malformed; no opening date was calculated.", "invalid"),
      deadline: unavailableDate("The booking target is malformed; no deadline was calculated.", "invalid"),
    };
  }

  const rule = value.bookingRule;
  const override = value.manualOverride;
  const verification = rule?.verification || "unavailable";
  const inconsistentRule = rule
    && rule.openingDaysBeforeTrip !== null
    && rule.deadlineDaysBeforeTrip !== null
    && rule.openingDaysBeforeTrip < rule.deadlineDaysBeforeTrip;

  let opening = resolveWindowDate(
    "opening",
    value.desiredTripDate,
    override?.openingDate || null,
    rule?.openingDaysBeforeTrip ?? null,
    verification,
  );
  let deadline = resolveWindowDate(
    "deadline",
    value.desiredTripDate,
    override?.deadlineDate || null,
    rule?.deadlineDaysBeforeTrip ?? null,
    verification,
  );
  if (inconsistentRule) {
    if (!override?.openingDate) {
      opening = unavailableDate("The rule places the opening after the deadline; verify or override it.", "invalid");
    }
    if (!override?.deadlineDate) {
      deadline = unavailableDate("The rule places the deadline before the opening; verify or override it.", "invalid");
    }
  }

  return {
    targetId: value.id,
    desiredTripDate: value.desiredTripDate || null,
    planningTimeZone: TRIP_TIME_ZONE,
    ruleProvenance: rule?.provenance || null,
    ruleVerification: verification,
    opening,
    deadline,
  };
}
