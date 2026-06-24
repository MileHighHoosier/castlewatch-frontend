import type { SpecialEventIntelligenceData, SpecialEventSignal } from "../components/SpecialEventIntelligence";
import type { TripProfile, TripReservation } from "./tripProfile";
import { buildReservationWarnings } from "./tripProfile";
import {
  ResortPlan,
  getResortOption,
  previousDate,
} from "./tripResorts";

export type DecisionScenarioId = "base" | "alternate";
export type DecisionStatus = "keep" | "swap" | "wait" | "review";
export type ReadinessStatus = "ready" | "watch" | "pending" | "blocked";

export type DecisionForecast = {
  status?: string;
  comparison?: string;
  summary?: string;
  confidence?: { label?: string };
  best_window?: { window?: string } | null;
  peak_window?: { window?: string } | null;
};

export type DecisionDay = {
  date: string;
  type?: string;
  park?: string;
  title?: string;
  forecast?: DecisionForecast;
  special_event_signals?: SpecialEventSignal[];
};

export type DecisionScenario = {
  id: DecisionScenarioId;
  label: string;
  score: number;
  eventRisk: number;
  reservationRisk: number;
  resortTravelRisk: number;
  forecastRisk: number;
  affectedConfirmed: TripReservation[];
  affectedProvisional: TripReservation[];
  reasons: string[];
};

export type DecisionReadiness = {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
};

export type TripWeekDecision = {
  status: DecisionStatus;
  preferredScenario: DecisionScenarioId;
  headline: string;
  summary: string;
  confidence: "Low" | "Medium" | "High";
  confidenceReason: string;
  scenarios: Record<DecisionScenarioId, DecisionScenario>;
  keyReasons: string[];
  blockers: string[];
  nextActions: string[];
  readiness: DecisionReadiness[];
  generatedAt: string;
};

type BuildDecisionInput = {
  baseDays: DecisionDay[];
  alternateDays: DecisionDay[];
  intelligence?: SpecialEventIntelligenceData;
  reservations: TripReservation[];
  resortPlan: ResortPlan;
  profile: TripProfile;
};

const PARKS = ["Magic Kingdom", "Epcot", "Hollywood Studios", "Animal Kingdom"];

function parkForReservation(reservation: TripReservation) {
  return PARKS.includes(reservation.location) ? reservation.location : null;
}

function scenarioAssignments(days: DecisionDay[]) {
  const assignments: Record<string, string> = {};
  for (const day of days) {
    if (day.park) assignments[day.date] = day.park;
  }
  return assignments;
}

function forecastPenalty(forecast?: DecisionForecast) {
  if (!forecast || forecast.status === "unavailable") return 1;
  const penalties: Record<string, number> = {
    noticeably_busier: 4,
    slightly_busier: 2,
    near_typical: 1,
    slightly_quieter: -1,
    noticeably_quieter: -2,
  };
  const base = penalties[forecast.comparison || ""] ?? 1;
  const confidence = (forecast.confidence?.label || "").toLowerCase();
  if (confidence.includes("early") || confidence.includes("low")) return Math.round(base * 0.5 * 10) / 10;
  return base;
}

function reservationImpact(
  assignments: Record<string, string>,
  reservations: TripReservation[],
  noParkHopping: boolean,
) {
  const confirmed: TripReservation[] = [];
  const provisional: TripReservation[] = [];

  for (const reservation of reservations) {
    const reservationPark = parkForReservation(reservation);
    const assignedPark = assignments[reservation.date];
    if (!reservationPark || !assignedPark || reservationPark === assignedPark) continue;
    if (reservation.status === "confirmed") confirmed.push(reservation);
    else provisional.push(reservation);
  }

  const confirmedWeight = noParkHopping ? 8 : 5;
  const provisionalWeight = noParkHopping ? 4 : 2;
  return {
    confirmed,
    provisional,
    score: confirmed.length * confirmedWeight + provisional.length * provisionalWeight,
  };
}

function resortTravelPenalty(resortId: string | undefined, park: string) {
  const resort = getResortOption(resortId);

  if (park === "Epcot") {
    if (resort.category === "epcot-resort") return { score: 0, note: `${resort.shortName} gives EPCOT its strongest access advantage.` };
    if (resort.category === "skyliner" || resort.category === "monorail-resort") return { score: 1, note: `${resort.shortName} has a useful EPCOT connection.` };
    return { score: 3, note: `${resort.shortName} requires a longer EPCOT transfer.` };
  }

  if (park === "Hollywood Studios") {
    if (resort.category === "epcot-resort" || resort.category === "skyliner") return { score: 0, note: `${resort.shortName} is well positioned for Hollywood Studios.` };
    return { score: 2, note: `${resort.shortName} normally requires bus transportation to Hollywood Studios.` };
  }

  if (park === "Magic Kingdom") {
    if (resort.category === "monorail-resort") return { score: 0, note: `${resort.shortName} is highly convenient for Magic Kingdom.` };
    if (resort.category === "epcot-resort" || resort.category === "akl") return { score: 4, note: `${resort.shortName} is a relatively long Magic Kingdom transfer.` };
    return { score: 2, note: `${resort.shortName} uses direct destination-labeled bus service to Magic Kingdom.` };
  }

  if (park === "Animal Kingdom") {
    if (resort.category === "akl") return { score: 0, note: `${resort.shortName} is the strongest location for Animal Kingdom.` };
    return { score: 2, note: `${resort.shortName} normally requires bus transportation to Animal Kingdom.` };
  }

  return { score: 2, note: `${resort.shortName} has standard Disney transportation access.` };
}

function scenarioResortRisk(assignments: Record<string, string>, resortPlan: ResortPlan) {
  let score = 0;
  const notes: string[] = [];

  for (const [date, park] of Object.entries(assignments)) {
    const originNight = previousDate(date);
    const result = resortTravelPenalty(resortPlan[originNight], park);
    score += result.score;
    if (result.score === 0 || result.score >= 3) notes.push(result.note);
  }

  return { score, notes: Array.from(new Set(notes)) };
}

function scenarioForecastRisk(days: DecisionDay[]) {
  let score = 0;
  const notes: string[] = [];

  for (const day of days) {
    if (!day.park) continue;
    const penalty = forecastPenalty(day.forecast);
    score += penalty;
    const comparison = day.forecast?.comparison;
    if (comparison === "noticeably_busier") notes.push(`${day.park} on ${day.date} has a noticeably busier historical signal.`);
    if (comparison === "noticeably_quieter") notes.push(`${day.park} on ${day.date} has a noticeably quieter historical signal.`);
  }

  return { score: Math.round(score * 10) / 10, notes };
}

function scenarioEventRisk(
  id: DecisionScenarioId,
  intelligence?: SpecialEventIntelligenceData,
) {
  const scenario = intelligence?.scenarios?.[id];
  return {
    score: Number(scenario?.event_risk_score || 0),
    notes: scenario?.reasons || [],
  };
}

function buildScenario(
  id: DecisionScenarioId,
  days: DecisionDay[],
  intelligence: SpecialEventIntelligenceData | undefined,
  reservations: TripReservation[],
  resortPlan: ResortPlan,
  profile: TripProfile,
): DecisionScenario {
  const assignments = scenarioAssignments(days);
  const event = scenarioEventRisk(id, intelligence);
  const reservation = reservationImpact(assignments, reservations, profile.noParkHopping);
  const resort = scenarioResortRisk(assignments, resortPlan);
  const forecast = scenarioForecastRisk(days);
  const score = Math.round((event.score + reservation.score + resort.score + forecast.score) * 10) / 10;

  const reasons = [
    ...event.notes,
    ...resort.notes,
    ...forecast.notes,
  ];

  if (reservation.confirmed.length) {
    reasons.push(`${reservation.confirmed.length} confirmed reservation${reservation.confirmed.length === 1 ? " conflicts" : "s conflict"} with this park order.`);
  }
  if (reservation.provisional.length) {
    reasons.push(`${reservation.provisional.length} provisional reservation${reservation.provisional.length === 1 ? " needs" : "s need"} review under this park order.`);
  }

  return {
    id,
    label: id === "base" ? "Base plan" : "MNSSHP alternate",
    score,
    eventRisk: event.score,
    reservationRisk: reservation.score,
    resortTravelRisk: resort.score,
    forecastRisk: forecast.score,
    affectedConfirmed: reservation.confirmed,
    affectedProvisional: reservation.provisional,
    reasons: Array.from(new Set(reasons)).slice(0, 8),
  };
}

function calendarReadiness(intelligence?: SpecialEventIntelligenceData): DecisionReadiness {
  const status = intelligence?.overall_status;
  if (status === "official") {
    return { id: "calendar", label: "Events and park hours", status: "ready", detail: "Official schedule data is loaded." };
  }
  if (status === "stale" || status === "unavailable") {
    return { id: "calendar", label: "Events and park hours", status: "blocked", detail: "The calendar source is stale or unavailable; CastleWatch is preserving cached data." };
  }
  if (status === "partial") {
    return { id: "calendar", label: "Events and park hours", status: "watch", detail: "Some official schedule data is loaded, but the week is not complete." };
  }
  return { id: "calendar", label: "Events and park hours", status: "pending", detail: "The 2027 MNSSHP calendar and operating hours are not released yet." };
}

function reservationReadiness(reservations: TripReservation[], warnings: ReturnType<typeof buildReservationWarnings>): DecisionReadiness {
  const conflicts = warnings.filter((warning) => warning.level === "conflict").length;
  const confirmed = reservations.filter((reservation) => reservation.status === "confirmed").length;
  if (conflicts) {
    return { id: "reservations", label: "Reservations", status: "blocked", detail: `${conflicts} reservation conflict${conflicts === 1 ? "" : "s"} must be resolved before locking the week.` };
  }
  if (!reservations.length) {
    return { id: "reservations", label: "Reservations", status: "pending", detail: "No bookings are entered yet; scenario impact is currently based on the itinerary alone." };
  }
  if (confirmed === reservations.length) {
    return { id: "reservations", label: "Reservations", status: "ready", detail: `${confirmed} confirmed booking${confirmed === 1 ? " is" : "s are"} included in the decision.` };
  }
  return { id: "reservations", label: "Reservations", status: "watch", detail: `${confirmed} of ${reservations.length} bookings are confirmed; provisional items can still move.` };
}

function resortReadiness(resortPlan: ResortPlan): DecisionReadiness {
  const unresolved = Object.values(resortPlan).filter((resortId) => resortId === "value_tbd").length;
  if (!unresolved) {
    return { id: "resorts", label: "Overnight resorts and transportation", status: "ready", detail: "All overnight resorts are selected and transportation convenience is scored." };
  }
  return { id: "resorts", label: "Overnight resorts and transportation", status: "watch", detail: `${unresolved} overnight choice${unresolved === 1 ? " is" : "s are"} still generic; transportation scores will refine after booking.` };
}

function forecastReadiness(baseDays: DecisionDay[], alternateDays: DecisionDay[]): DecisionReadiness {
  const parkDays = [...baseDays, ...alternateDays].filter((day) => day.park);
  const unavailable = parkDays.filter((day) => !day.forecast || day.forecast.status === "unavailable").length;
  if (!unavailable) {
    return { id: "crowds", label: "Historical crowd signals", status: "ready", detail: "All compared park days have a historical forecast signal." };
  }
  return { id: "crowds", label: "Historical crowd signals", status: "watch", detail: `${unavailable} compared park-day forecast${unavailable === 1 ? " is" : "s are"} unavailable.` };
}

function weatherReadiness(): DecisionReadiness {
  return {
    id: "weather",
    label: "Weather readiness",
    status: "pending",
    detail: "A reliable trip-week forecast is not available this far out. The live heat/storm guard is ready for the travel window.",
  };
}

function lightningLaneReadiness(intelligence?: SpecialEventIntelligenceData): DecisionReadiness {
  const hoursReady = intelligence?.sources?.find((source) => source.id === "park_hours")?.data_status === "official";
  return {
    id: "lightning-lane",
    label: "Lightning Lane readiness",
    status: hoursReady ? "watch" : "pending",
    detail: hoursReady
      ? "Park hours are available; final Lightning Lane windows still depend on confirmed bookings and current product rules."
      : "Lightning Lane tools are built, but trip-week windows cannot be finalized until official park hours are loaded.",
  };
}

function decisionConfidence(
  intelligence: SpecialEventIntelligenceData | undefined,
  reservations: TripReservation[],
  scoreDifference: number,
) {
  const official = intelligence?.overall_status === "official";
  const allConfirmed = reservations.length > 0 && reservations.every((reservation) => reservation.status === "confirmed");
  if (official && allConfirmed && scoreDifference >= 4) {
    return { confidence: "High" as const, reason: "Official calendars, confirmed bookings and a meaningful scenario gap support the recommendation." };
  }
  if ((official || intelligence?.overall_status === "partial") && scoreDifference >= 2) {
    return { confidence: "Medium" as const, reason: "Several planning inputs are available, but at least one important input remains provisional." };
  }
  return { confidence: "Low" as const, reason: "The MNSSHP calendar, park hours, reservations or long-range conditions are still incomplete." };
}

export function buildTripWeekDecision(input: BuildDecisionInput): TripWeekDecision {
  const baseAssignments = scenarioAssignments(input.baseDays);
  const warnings = buildReservationWarnings(input.reservations, baseAssignments, input.profile.noParkHopping);
  const base = buildScenario("base", input.baseDays, input.intelligence, input.reservations, input.resortPlan, input.profile);
  const alternate = buildScenario("alternate", input.alternateDays, input.intelligence, input.reservations, input.resortPlan, input.profile);
  const preferredScenario: DecisionScenarioId = base.score <= alternate.score ? "base" : "alternate";
  const scoreDifference = Math.abs(base.score - alternate.score);
  const calendarRecommendation = input.intelligence?.recommendation?.status;
  const confirmedConflictOnPreferred = (preferredScenario === "base" ? base : alternate).affectedConfirmed.length > 0;
  const bothHaveConfirmedConflicts = base.affectedConfirmed.length > 0 && alternate.affectedConfirmed.length > 0;

  let status: DecisionStatus;
  let headline: string;
  let summary: string;

  if (calendarRecommendation === "wait_for_calendar") {
    status = "wait";
    headline = preferredScenario === "base" ? "Keep the base plan provisional" : "The alternate currently scores better, but wait before switching";
    summary = `CastleWatch scores the ${preferredScenario === "base" ? "base plan" : "MNSSHP alternate"} lower-risk by ${scoreDifference.toFixed(1)} points, but the official party calendar has not triggered a schedule change.`;
  } else if (bothHaveConfirmedConflicts) {
    status = "review";
    headline = "Both park orders conflict with confirmed bookings";
    summary = "Do not lock or apply either scenario until the confirmed reservation conflicts are resolved.";
  } else if (confirmedConflictOnPreferred) {
    status = "review";
    headline = "The lower-risk park order conflicts with a confirmed booking";
    summary = "The score favors one scenario, but CastleWatch will not recommend applying it while a confirmed reservation would be displaced.";
  } else if (preferredScenario === "alternate") {
    status = "swap";
    headline = "The MNSSHP alternate is the better current plan";
    summary = `The alternate scores ${scoreDifference.toFixed(1)} points better after combining event risk, reservations, resort travel and historical crowd signals.`;
  } else {
    status = "keep";
    headline = "Keep the current park order";
    summary = `The base plan scores ${scoreDifference.toFixed(1)} points better after combining event risk, reservations, resort travel and historical crowd signals.`;
  }

  const confidence = decisionConfidence(input.intelligence, input.reservations, scoreDifference);
  const preferred = preferredScenario === "base" ? base : alternate;
  const blockers: string[] = [];
  if (calendarRecommendation === "wait_for_calendar") blockers.push("Official 2027 MNSSHP dates are not loaded.");
  if (input.intelligence?.overall_status === "stale" || input.intelligence?.overall_status === "unavailable") blockers.push("The official calendar source is stale or unavailable.");
  if (preferred.affectedConfirmed.length) blockers.push(`${preferred.affectedConfirmed.length} confirmed reservation${preferred.affectedConfirmed.length === 1 ? " conflicts" : "s conflict"} with the preferred scenario.`);
  if (warnings.some((warning) => warning.level === "conflict")) blockers.push("The current reservation set contains an internal park or timing conflict.");

  const readiness = [
    calendarReadiness(input.intelligence),
    reservationReadiness(input.reservations, warnings),
    resortReadiness(input.resortPlan),
    forecastReadiness(input.baseDays, input.alternateDays),
    weatherReadiness(),
    lightningLaneReadiness(input.intelligence),
  ];

  const nextActions: string[] = [];
  if (calendarRecommendation === "wait_for_calendar") nextActions.push("Keep Sunday Magic Kingdom and Wednesday EPCOT marked provisional until the MNSSHP dates are official.");
  if (readiness.find((item) => item.id === "resorts")?.status !== "ready") nextActions.push("Replace generic value-resort nights after the hotel bookings are finalized.");
  if (!input.reservations.length) nextActions.push("Add priority bookings as provisional before reservation day so CastleWatch can measure scenario impact.");
  if (preferred.affectedConfirmed.length) nextActions.push("Review confirmed bookings before changing the park order.");
  if (!nextActions.length) nextActions.push(status === "swap" ? "Review the affected bookings, then manually approve the swap." : "Keep the park order and continue monitoring calendar changes.");

  return {
    status,
    preferredScenario,
    headline,
    summary,
    confidence: confidence.confidence,
    confidenceReason: confidence.reason,
    scenarios: { base, alternate },
    keyReasons: preferred.reasons.slice(0, 5),
    blockers: Array.from(new Set(blockers)),
    nextActions: Array.from(new Set(nextActions)).slice(0, 4),
    readiness,
    generatedAt: new Date().toISOString(),
  };
}
