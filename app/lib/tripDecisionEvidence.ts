export type DecisionEvidenceAvailability =
  | "available"
  | "unavailable"
  | "out_of_horizon"
  | "stale"
  | "not_assignable";

export type DecisionEvidenceConfidence = "high" | "medium" | "low" | "not_applicable";

export type DecisionEvidenceFreshness = {
  status: "current" | "stale" | "unknown" | "not_applicable";
  observedAt?: string;
  detail: string;
};

export type DecisionSignalKind =
  | "events"
  | "reservations"
  | "transportation"
  | "historical_crowds"
  | "weather"
  | "lightning_lane";

export type DecisionEvidenceProvenance =
  | "backend:event-calendar"
  | "backend:historical-forecast"
  | "browser:trip-reservations"
  | "browser:resort-plan"
  | "browser:weather-advisory"
  | "browser:lightning-lane";

export type DecisionEvidence = {
  id: string;
  signal: DecisionSignalKind;
  label: string;
  availability: DecisionEvidenceAvailability;
  provenance: DecisionEvidenceProvenance;
  freshness: DecisionEvidenceFreshness;
  confidence: DecisionEvidenceConfidence;
  contribution: number;
  explanation: string;
  affectedDate?: string;
  affectedPark?: string;
};

type DecisionEvidenceInput = Omit<DecisionEvidence, "contribution"> & {
  contribution: number;
};

function roundedFiniteContribution(value: number) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

export function createDecisionEvidence(input: DecisionEvidenceInput): DecisionEvidence {
  const usable = input.availability === "available"
    && input.freshness.status !== "stale";

  return {
    ...input,
    contribution: usable ? roundedFiniteContribution(input.contribution) : 0,
  };
}

export function sumDecisionEvidence(
  evidence: DecisionEvidence[],
  signal?: DecisionSignalKind,
) {
  const total = evidence
    .filter((item) => !signal || item.signal === signal)
    .reduce((sum, item) => sum + item.contribution, 0);
  return Math.round(total * 10) / 10;
}
