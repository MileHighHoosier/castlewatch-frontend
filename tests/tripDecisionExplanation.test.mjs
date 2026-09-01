import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildScenarioEvidenceGroups,
  evidenceContext,
  evidenceProvenanceLabel,
  evidenceStateLabel,
  riskPointsLabel,
} from "../app/lib/tripDecisionExplanation.ts";

function item(overrides = {}) {
  return {
    id: "events:base",
    signal: "events",
    label: "Base event signal",
    availability: "available",
    provenance: "backend:event-calendar",
    freshness: { status: "current", detail: "Current response." },
    confidence: "high",
    contribution: 2,
    explanation: "An official event affects this date.",
    affectedDate: "2027-10-10",
    affectedPark: "Magic Kingdom",
    ...overrides,
  };
}

function scenario(evidence) {
  return {
    id: "base",
    label: "Base plan",
    score: evidence.reduce((sum, entry) => sum + entry.contribution, 0),
    eventRisk: 0,
    reservationRisk: 0,
    resortTravelRisk: 0,
    forecastRisk: 0,
    weatherRisk: 0,
    lightningLaneRisk: 0,
    affectedConfirmed: [],
    affectedProvisional: [],
    reasons: [],
    evidence,
  };
}

test("scenario evidence is grouped in the stable user-facing decision order", () => {
  const evidence = [
    item(),
    item({ id: "reservations:base", signal: "reservations", contribution: 4 }),
    item({ id: "weather:base", signal: "weather", contribution: 0, availability: "out_of_horizon" }),
  ];
  const groups = buildScenarioEvidenceGroups(scenario(evidence));

  assert.deepEqual(groups.map((group) => group.signal), [
    "events",
    "reservations",
    "transportation",
    "historical_crowds",
    "weather",
    "lightning_lane",
  ]);
  assert.equal(groups.find((group) => group.signal === "events")?.contribution, 2);
  assert.equal(groups.find((group) => group.signal === "reservations")?.contribution, 4);
  assert.equal(groups.find((group) => group.signal === "weather")?.state, "Outside trustworthy horizon · neutral");
});

test("evidence labels explain state, source, context and signed contribution", () => {
  const evidence = item();
  assert.equal(evidenceStateLabel(evidence), "Available · current · high confidence");
  assert.equal(evidenceProvenanceLabel(evidence.provenance), "Official calendar feed");
  assert.equal(evidenceContext(evidence), "2027-10-10 · Magic Kingdom");
  assert.equal(riskPointsLabel(evidence.contribution), "+2 points");
  assert.equal(riskPointsLabel(-1), "-1 point");
  assert.equal(riskPointsLabel(0), "0 points");
});

test("mixed usable and neutral items stay explicit in one category", () => {
  const groups = buildScenarioEvidenceGroups(scenario([
    item({ id: "weather:current", signal: "weather", contribution: 4 }),
    item({ id: "weather:stale", signal: "weather", availability: "stale", freshness: { status: "stale", detail: "Old." }, contribution: 0 }),
  ]));
  const weather = groups.find((group) => group.signal === "weather");
  assert.equal(weather?.state, "Mixed usable and neutral evidence");
  assert.equal(weather?.contribution, 4);
});

test("decision card exposes evidence and preserves explicit manual controls", async () => {
  const source = await readFile(new URL("../app/components/TripWeekDecisionCard.tsx", import.meta.url), "utf8");
  assert.match(source, /Decision evidence &amp; reservation impact/);
  assert.match(source, /Plan changes are never automatic/);
  assert.match(source, /Review recommended change/);
  assert.match(source, /Undo last park-order change/);
  assert.match(source, /Lock current park order/);
  assert.match(source, /Unlock park order/);
  assert.match(source, /Affected reservations/);
});
