import type {
  DecisionEvidence,
  DecisionEvidenceAvailability,
  DecisionEvidenceProvenance,
  DecisionScenario,
  DecisionSignalKind,
} from "./tripDecisionEngine";

const SIGNAL_ORDER: DecisionSignalKind[] = [
  "events",
  "reservations",
  "transportation",
  "historical_crowds",
  "weather",
  "lightning_lane",
];

const SIGNAL_LABELS: Record<DecisionSignalKind, string> = {
  events: "Events and park hours",
  reservations: "Reservations",
  transportation: "Transportation",
  historical_crowds: "Historical crowds",
  weather: "Weather",
  lightning_lane: "Lightning Lane",
};

const AVAILABILITY_LABELS: Record<DecisionEvidenceAvailability, string> = {
  available: "Available",
  unavailable: "Unavailable · neutral",
  out_of_horizon: "Outside trustworthy horizon · neutral",
  stale: "Stale · neutral",
  not_assignable: "Not assignable · neutral",
};

const PROVENANCE_LABELS: Record<DecisionEvidenceProvenance, string> = {
  "backend:event-calendar": "Official calendar feed",
  "backend:historical-forecast": "Historical forecast service",
  "browser:trip-reservations": "Saved trip reservations",
  "browser:resort-plan": "Saved resort plan",
  "browser:weather-advisory": "Weather advisory",
  "browser:lightning-lane": "Saved Lightning Lane windows",
};

export type DecisionEvidenceGroup = {
  signal: DecisionSignalKind;
  label: string;
  contribution: number;
  state: string;
  evidence: DecisionEvidence[];
};

function roundedTotal(evidence: DecisionEvidence[]) {
  return Math.round(evidence.reduce((sum, item) => sum + item.contribution, 0) * 10) / 10;
}

export function evidenceAvailabilityLabel(availability: DecisionEvidenceAvailability) {
  return AVAILABILITY_LABELS[availability];
}

export function evidenceProvenanceLabel(provenance: DecisionEvidenceProvenance) {
  return PROVENANCE_LABELS[provenance];
}

export function evidenceStateLabel(evidence: DecisionEvidence) {
  const parts = [evidenceAvailabilityLabel(evidence.availability)];
  if (evidence.availability === "available" && evidence.freshness.status === "current") {
    parts.push("current");
  }
  if (evidence.confidence !== "not_applicable") {
    parts.push(`${evidence.confidence} confidence`);
  }
  return parts.join(" · ");
}

export function evidenceContext(evidence: DecisionEvidence) {
  return [evidence.affectedDate, evidence.affectedPark].filter(Boolean).join(" · ");
}

export function riskPointsLabel(contribution: number) {
  const value = Math.round(contribution * 10) / 10;
  return `${value > 0 ? "+" : ""}${value} ${Math.abs(value) === 1 ? "point" : "points"}`;
}

export function buildScenarioEvidenceGroups(scenario: DecisionScenario): DecisionEvidenceGroup[] {
  return SIGNAL_ORDER.map((signal) => {
    const evidence = scenario.evidence.filter((item) => item.signal === signal);
    const availability = Array.from(new Set(evidence.map((item) => item.availability)));
    const state = availability.length === 1
      ? evidenceAvailabilityLabel(availability[0])
      : availability.some((item) => item === "available")
        ? "Mixed usable and neutral evidence"
        : "Neutral evidence only";
    return {
      signal,
      label: SIGNAL_LABELS[signal],
      contribution: roundedTotal(evidence),
      state,
      evidence,
    };
  });
}
