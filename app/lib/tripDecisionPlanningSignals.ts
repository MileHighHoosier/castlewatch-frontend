import type { LightningLane } from "./lightningLane";
import type { TripWeatherSnapshot } from "./weatherReliability";
import {
  createDecisionEvidence,
  type DecisionEvidence,
  type DecisionEvidenceAvailability,
} from "./tripDecisionEvidence";

export const TRIP_WEATHER_HORIZON_DAYS = 7;
export const TRIP_WEATHER_FRESHNESS_HOURS = 6;

export type ScenarioSignalDay = {
  date: string;
  park?: string;
};

function utcDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(time);
  return date.toISOString().slice(0, 10) === value ? time : null;
}

function weatherContribution(mode: TripWeatherSnapshot["mode"]) {
  if (mode === "storm") return 4;
  if (mode === "hot") return 2;
  return 0;
}

function effectiveWeatherAvailability(
  day: ScenarioSignalDay,
  snapshot: TripWeatherSnapshot | null | undefined,
  now: Date,
): DecisionEvidenceAvailability {
  const target = utcDay(day.date);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (target === null) return "not_assignable";

  const daysAway = Math.round((target - today) / 86400000);
  if (daysAway < 0 || daysAway > TRIP_WEATHER_HORIZON_DAYS) return "out_of_horizon";
  if (!snapshot?.mode || !snapshot.forecastDate) return "unavailable";
  if (snapshot.freshness === "stale") return "stale";
  if (snapshot.freshness !== "current") return "unavailable";
  if (snapshot.forecastDate !== day.date) return "not_assignable";

  if (snapshot.source === "auto" && snapshot.observedAt) {
    const observed = new Date(snapshot.observedAt);
    if (Number.isNaN(observed.getTime())) return "stale";
    const ageHours = (now.getTime() - observed.getTime()) / 3600000;
    if (ageHours < 0 || ageHours > TRIP_WEATHER_FRESHNESS_HOURS) return "stale";
  }
  return "available";
}

export function scenarioWeatherEvidence(
  days: ScenarioSignalDay[],
  snapshot: TripWeatherSnapshot | null | undefined,
  nowIso: string,
): DecisionEvidence[] {
  const now = new Date(nowIso);
  const safeNow = Number.isNaN(now.getTime()) ? new Date(0) : now;

  return days.filter((day) => day.park).map((day) => {
    const availability = effectiveWeatherAvailability(day, snapshot, safeNow);
    const explanation = availability === "out_of_horizon"
      ? `${day.date} is outside CastleWatch's ${TRIP_WEATHER_HORIZON_DAYS}-day trustworthy weather horizon; weather is neutral.`
      : availability === "stale"
        ? `The saved weather observation for ${day.date} is stale and does not affect the score.`
        : availability === "not_assignable"
          ? `The saved weather observation cannot be assigned to ${day.date}; weather is neutral.`
          : availability === "unavailable"
            ? `No trustworthy weather observation is available for ${day.date}; weather is neutral.`
            : `${snapshot?.headline || `${snapshot?.mode || "normal"} conditions`} is assigned to ${day.date}.`;

    return createDecisionEvidence({
      id: `weather:${day.date}:${day.park}`,
      signal: "weather",
      label: `${day.park} weather signal`,
      availability,
      provenance: "browser:weather-advisory",
      freshness: {
        status: availability === "stale"
          ? "stale"
          : snapshot?.freshness || "unknown",
        observedAt: snapshot?.observedAt || undefined,
        detail: explanation,
      },
      confidence: availability === "available"
        ? snapshot?.source === "auto" ? "medium" : "low"
        : "not_applicable",
      contribution: weatherContribution(snapshot?.mode || null),
      explanation,
      affectedDate: day.date,
      affectedPark: day.park,
    });
  });
}

export function scenarioLightningLaneEvidence(
  scenarioId: string,
  days: ScenarioSignalDay[],
  lanes: LightningLane[],
  noParkHopping: boolean,
) {
  const assignments = new Map(days.filter((day) => day.park).map((day) => [day.date, day.park as string]));
  if (!lanes.length) {
    return {
      score: 0,
      notes: [] as string[],
      evidence: [createDecisionEvidence({
        id: `lightning-lane:${scenarioId}:none`,
        signal: "lightning_lane",
        label: "Lightning Lane constraints",
        availability: "unavailable",
        provenance: "browser:lightning-lane",
        freshness: {
          status: "not_applicable",
          detail: "No saved Lightning Lane windows are available for scenario scoring.",
        },
        confidence: "not_applicable",
        contribution: 0,
        explanation: "No saved Lightning Lane windows affect this park order.",
      })],
    };
  }

  const notes: string[] = [];
  const evidence = lanes.map((lane) => {
    const assignedPark = lane.date ? assignments.get(lane.date) : undefined;
    const assignable = Boolean(lane.date && lane.park && assignedPark);
    const conflicts = assignable && !lane.used && assignedPark !== lane.park;
    const availability: DecisionEvidenceAvailability = assignable ? "available" : "not_assignable";
    const contribution = conflicts ? (noParkHopping ? 6 : 3) : 0;
    const explanation = !assignable
      ? `${lane.name} does not have both a valid Trip Week date and park assignment; it remains neutral.`
      : lane.used
        ? `${lane.name} on ${lane.date} is marked used and does not affect the scenario.`
        : conflicts
          ? `${lane.name} is saved for ${lane.park} on ${lane.date}, but this scenario assigns ${assignedPark}${noParkHopping ? " with no park hopping" : ""}.`
          : `${lane.name} is aligned with ${assignedPark} on ${lane.date}.`;
    if (conflicts) notes.push(explanation);

    return createDecisionEvidence({
      id: `lightning-lane:${scenarioId}:${lane.id}`,
      signal: "lightning_lane",
      label: `${lane.name} Lightning Lane`,
      availability,
      provenance: "browser:lightning-lane",
      freshness: {
        status: "not_applicable",
        detail: "This is a browser-local saved return window rather than time-sensitive forecast evidence.",
      },
      confidence: assignable ? "high" : "not_applicable",
      contribution,
      explanation,
      affectedDate: lane.date,
      affectedPark: lane.park,
    });
  });

  const score = Math.round(evidence.reduce((sum, item) => sum + item.contribution, 0) * 10) / 10;
  return { score, notes, evidence };
}
