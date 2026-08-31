import type { SpecialEventIntelligenceData, SpecialEventSignal } from "../components/SpecialEventIntelligence";
import type { TripProfile, TripReservation } from "./tripProfile";
import { buildReservationWarnings } from "./tripProfile";
import type { LightningLane } from "./lightningLane";
import type { TripWeatherSnapshot } from "./weatherReliability";
import {
  ResortPlan,
  previousDate,
} from "./tripResorts";
import {
  getResortTransportationRoute,
  transportationRouteRisk,
} from "./transportationPlanning";
import {
  DecisionEvidence,
  DecisionEvidenceAvailability,
  DecisionEvidenceConfidence,
  createDecisionEvidence,
  sumDecisionEvidence,
} from "./tripDecisionEvidence";
import {
  scenarioLightningLaneEvidence,
  scenarioWeatherEvidence,
} from "./tripDecisionPlanningSignals";

export type {
  DecisionEvidence,
  DecisionEvidenceAvailability,
  DecisionEvidenceConfidence,
  DecisionEvidenceProvenance,
  DecisionEvidenceFreshness,
  DecisionSignalKind,
} from "./tripDecisionEvidence";

export type DecisionScenarioId = "base" | "alternate";
export type DecisionStatus = "keep" | "swap" | "wait" | "review";
export type ReadinessStatus = "ready" | "watch" | "pending" | "blocked";

export type DecisionForecast = {
  status?: string;
  comparison?: string;
  summary?: string;
  confidence?: { level?: string; label?: string };
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
  weatherRisk: number;
  lightningLaneRisk: number;
  affectedConfirmed: TripReservation[];
  affectedProvisional: TripReservation[];
  reasons: string[];
  evidence: DecisionEvidence[];
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
  weather?: TripWeatherSnapshot | null;
  lightningLanes?: LightningLane[];
  nowIso?: string;
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
  if (!forecast || forecast.status === "unavailable") return 0;
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

function forecastConfidence(forecast?: DecisionForecast): DecisionEvidenceConfidence {
  const confidence = `${forecast?.confidence?.level || ""} ${forecast?.confidence?.label || ""}`.toLowerCase();
  if (confidence.includes("high") || confidence.includes("higher")) return "high";
  if (confidence.includes("medium")) return "medium";
  if (confidence.includes("low") || confidence.includes("early")) return "low";
  return forecast ? "low" : "not_applicable";
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

function scenarioResortRisk(assignments: Record<string, string>, resortPlan: ResortPlan) {
  let score = 0;
  const notes: string[] = [];
  const evidence: DecisionEvidence[] = [];

  for (const [date, park] of Object.entries(assignments)) {
    const originNight = previousDate(date);
    const resortId = resortPlan[originNight];
    const route = getResortTransportationRoute(resortId, park);
    const routeRisk = transportationRouteRisk(route);
    const item = createDecisionEvidence({
      id: `transportation:${date}:${park}`,
      signal: "transportation",
      label: `${park} transportation`,
      availability: route.assignable ? "available" : "not_assignable",
      provenance: "browser:resort-plan",
      freshness: {
        status: "not_applicable",
        detail: "The saved overnight resort is a planning selection rather than time-sensitive live evidence.",
      },
      confidence: !route.assignable ? "not_applicable" : resortId === "value_tbd" ? "low" : "medium",
      contribution: routeRisk,
      explanation: route.assignable
        ? `${route.explanation} This route is assigned from the ${originNight} overnight stay.`
        : `The origin resort for ${park} on ${date} is not assignable yet.`,
      affectedDate: date,
      affectedPark: park,
    });
    evidence.push(item);
    score += item.contribution;
    if (routeRisk === 0 || routeRisk >= 3) notes.push(item.explanation);
  }

  return { score: Math.round(score * 10) / 10, notes: Array.from(new Set(notes)), evidence };
}

function scenarioForecastRisk(days: DecisionDay[]) {
  let score = 0;
  const notes: string[] = [];
  const evidence: DecisionEvidence[] = [];

  for (const day of days) {
    if (!day.park) continue;
    const available = Boolean(day.forecast && day.forecast.status !== "unavailable");
    const penalty = forecastPenalty(day.forecast);
    const item = createDecisionEvidence({
      id: `historical-crowds:${day.date}:${day.park}`,
      signal: "historical_crowds",
      label: `${day.park} historical crowd signal`,
      availability: available ? "available" : "unavailable",
      provenance: "backend:historical-forecast",
      freshness: {
        status: "not_applicable",
        detail: "This is historical directional evidence for a target date, not a live 2027 prediction.",
      },
      confidence: available ? forecastConfidence(day.forecast) : "not_applicable",
      contribution: penalty,
      explanation: available
        ? day.forecast?.summary || `${day.park} has a ${day.forecast?.comparison || "typical"} historical signal for ${day.date}.`
        : `Historical crowd evidence is unavailable for ${day.park} on ${day.date}; it does not affect the score.`,
      affectedDate: day.date,
      affectedPark: day.park,
    });
    evidence.push(item);
    score += item.contribution;
    const comparison = day.forecast?.comparison;
    if (comparison === "noticeably_busier") notes.push(`${day.park} on ${day.date} has a noticeably busier historical signal.`);
    if (comparison === "noticeably_quieter") notes.push(`${day.park} on ${day.date} has a noticeably quieter historical signal.`);
  }

  return { score: Math.round(score * 10) / 10, notes, evidence };
}

function scenarioEventRisk(
  id: DecisionScenarioId,
  intelligence?: SpecialEventIntelligenceData,
) {
  const scenario = intelligence?.scenarios?.[id];
  let availability: DecisionEvidenceAvailability = "available";
  if (!scenario || intelligence?.overall_status === "unavailable") availability = "unavailable";
  if (intelligence?.overall_status === "stale") availability = "stale";
  const rawScore = Number(scenario?.event_risk_score || 0);
  const evidence = createDecisionEvidence({
    id: `events:${id}`,
    signal: "events",
    label: `${id === "base" ? "Base plan" : "MNSSHP alternate"} event/calendar signal`,
    availability,
    provenance: "backend:event-calendar",
    freshness: {
      status: availability === "stale" ? "stale" : intelligence?.generated_at ? "current" : "unknown",
      observedAt: intelligence?.generated_at,
      detail: availability === "stale"
        ? "The calendar source is stale, so cached event risk is shown but does not affect the score."
        : intelligence?.generated_at
          ? "Generated with the current Trip Week event-intelligence response."
          : "The event-intelligence response did not provide a generation time.",
    },
    confidence: availability !== "available"
      ? "not_applicable"
      : intelligence?.overall_status === "official"
        ? "high"
        : intelligence?.overall_status === "partial"
          ? "medium"
          : "low",
    contribution: rawScore,
    explanation: scenario?.reasons?.join(" ")
      || (availability === "available"
        ? "No event-specific risk was reported for this scenario."
        : "Event/calendar evidence is unavailable and does not affect the score."),
  });
  return {
    score: evidence.contribution,
    notes: scenario?.reasons || [],
    evidence,
  };
}

function reservationEvidence(
  id: DecisionScenarioId,
  reservation: ReturnType<typeof reservationImpact>,
  noParkHopping: boolean,
) {
  const affected = reservation.confirmed.length + reservation.provisional.length;
  return createDecisionEvidence({
    id: `reservations:${id}`,
    signal: "reservations",
    label: `${id === "base" ? "Base plan" : "MNSSHP alternate"} reservation impact`,
    availability: "available",
    provenance: "browser:trip-reservations",
    freshness: {
      status: "not_applicable",
      detail: "This contribution comes from the current browser-local reservation snapshot.",
    },
    confidence: affected ? "high" : "medium",
    contribution: reservation.score,
    explanation: affected
      ? `${reservation.confirmed.length} confirmed and ${reservation.provisional.length} provisional reservation conflicts are assigned to this park order${noParkHopping ? " with no park hopping" : ""}.`
      : "No saved reservation conflicts are assigned to this park order.",
  });
}

function buildScenario(
  id: DecisionScenarioId,
  days: DecisionDay[],
  intelligence: SpecialEventIntelligenceData | undefined,
  reservations: TripReservation[],
  resortPlan: ResortPlan,
  profile: TripProfile,
  weather: TripWeatherSnapshot | null | undefined,
  lightningLanes: LightningLane[],
  nowIso: string,
): DecisionScenario {
  const assignments = scenarioAssignments(days);
  const event = scenarioEventRisk(id, intelligence);
  const reservation = reservationImpact(assignments, reservations, profile.noParkHopping);
  const reservationSignal = reservationEvidence(id, reservation, profile.noParkHopping);
  const resort = scenarioResortRisk(assignments, resortPlan);
  const forecast = scenarioForecastRisk(days);
  const weatherEvidence = scenarioWeatherEvidence(days, weather, nowIso);
  const lightningLane = scenarioLightningLaneEvidence(id, days, lightningLanes, profile.noParkHopping);
  const evidence = [
    event.evidence,
    reservationSignal,
    ...resort.evidence,
    ...forecast.evidence,
    ...weatherEvidence,
    ...lightningLane.evidence,
  ];
  const score = sumDecisionEvidence(evidence);

  const reasons = [
    ...event.notes,
    ...resort.notes,
    ...forecast.notes,
    ...lightningLane.notes,
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
    eventRisk: sumDecisionEvidence(evidence, "events"),
    reservationRisk: sumDecisionEvidence(evidence, "reservations"),
    resortTravelRisk: sumDecisionEvidence(evidence, "transportation"),
    forecastRisk: sumDecisionEvidence(evidence, "historical_crowds"),
    weatherRisk: sumDecisionEvidence(evidence, "weather"),
    lightningLaneRisk: sumDecisionEvidence(evidence, "lightning_lane"),
    affectedConfirmed: reservation.confirmed,
    affectedProvisional: reservation.provisional,
    reasons: Array.from(new Set(reasons)).slice(0, 8),
    evidence,
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

function weatherReadiness(scenarios: DecisionScenario[]): DecisionReadiness {
  const evidence = scenarios.flatMap((scenario) => scenario.evidence.filter((item) => item.signal === "weather"));
  const available = evidence.filter((item) => item.availability === "available").length;
  if (available) {
    return { id: "weather", label: "Weather readiness", status: "ready", detail: `${available} scenario weather assignment${available === 1 ? " is" : "s are"} inside the trustworthy horizon and included in scoring.` };
  }
  if (evidence.some((item) => item.availability === "stale")) {
    return { id: "weather", label: "Weather readiness", status: "watch", detail: "Saved weather evidence is stale, so it is visible but neutral until refreshed." };
  }
  if (evidence.length && evidence.every((item) => item.availability === "out_of_horizon")) {
    return { id: "weather", label: "Weather readiness", status: "pending", detail: "Trip Week is outside CastleWatch's 7-day trustworthy weather horizon; weather is explicitly neutral." };
  }
  return { id: "weather", label: "Weather readiness", status: "pending", detail: "No date-assignable trustworthy weather evidence is available; the live heat/storm guard remains ready for the travel window." };
}

function lightningLaneReadiness(
  intelligence: SpecialEventIntelligenceData | undefined,
  lanes: LightningLane[],
  scenarios: DecisionScenario[],
): DecisionReadiness {
  const evidence = scenarios.flatMap((scenario) => scenario.evidence.filter((item) => item.signal === "lightning_lane"));
  const assignable = evidence.filter((item) => item.availability === "available").length;
  if (assignable) {
    return { id: "lightning-lane", label: "Lightning Lane readiness", status: "ready", detail: `${assignable} scenario window assignment${assignable === 1 ? " is" : "s are"} date- and park-specific and included in scoring.` };
  }
  if (lanes.length) {
    return { id: "lightning-lane", label: "Lightning Lane readiness", status: "watch", detail: "Saved windows without both a Trip Week date and park remain backward-compatible and neutral." };
  }
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
  const nowIso = input.nowIso || new Date().toISOString();
  const lightningLanes = input.lightningLanes || [];
  const baseAssignments = scenarioAssignments(input.baseDays);
  const warnings = buildReservationWarnings(input.reservations, baseAssignments, input.profile.noParkHopping);
  const base = buildScenario("base", input.baseDays, input.intelligence, input.reservations, input.resortPlan, input.profile, input.weather, lightningLanes, nowIso);
  const alternate = buildScenario("alternate", input.alternateDays, input.intelligence, input.reservations, input.resortPlan, input.profile, input.weather, lightningLanes, nowIso);
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
    summary = `The alternate scores ${scoreDifference.toFixed(1)} points better after combining events, reservations, travel, crowds, weather and Lightning Lane constraints.`;
  } else {
    status = "keep";
    headline = "Keep the current park order";
    summary = `The base plan scores ${scoreDifference.toFixed(1)} points better after combining events, reservations, travel, crowds, weather and Lightning Lane constraints.`;
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
    weatherReadiness([base, alternate]),
    lightningLaneReadiness(input.intelligence, lightningLanes, [base, alternate]),
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
    generatedAt: nowIso,
  };
}