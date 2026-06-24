export type TripWeekScenarioId = "base" | "alternate";

export type TripWeekApprovalState = {
  activeScenario: TripWeekScenarioId;
  previousScenario: TripWeekScenarioId | null;
  locked: boolean;
  lockedAt: string | null;
  updatedAt: string;
};

export const TRIP_WEEK_APPROVAL_STORAGE_KEY = "castlewatch.trip-week-approval.v1";

export const DEFAULT_TRIP_WEEK_APPROVAL: TripWeekApprovalState = {
  activeScenario: "base",
  previousScenario: null,
  locked: false,
  lockedAt: null,
  updatedAt: "",
};

function isScenario(value: unknown): value is TripWeekScenarioId {
  return value === "base" || value === "alternate";
}

export function loadTripWeekApproval(): TripWeekApprovalState {
  if (typeof window === "undefined") return { ...DEFAULT_TRIP_WEEK_APPROVAL };

  try {
    const stored = window.localStorage.getItem(TRIP_WEEK_APPROVAL_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_TRIP_WEEK_APPROVAL };

    const parsed = JSON.parse(stored) as Partial<TripWeekApprovalState>;
    return {
      activeScenario: isScenario(parsed.activeScenario) ? parsed.activeScenario : "base",
      previousScenario: isScenario(parsed.previousScenario) ? parsed.previousScenario : null,
      locked: parsed.locked === true,
      lockedAt: typeof parsed.lockedAt === "string" ? parsed.lockedAt : null,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    return { ...DEFAULT_TRIP_WEEK_APPROVAL };
  }
}

export function saveTripWeekApproval(state: TripWeekApprovalState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TRIP_WEEK_APPROVAL_STORAGE_KEY, JSON.stringify(state));
}

export function scenarioLabel(scenario: TripWeekScenarioId) {
  return scenario === "alternate" ? "MNSSHP alternate" : "Base plan";
}
