import test from "node:test";
import assert from "node:assert/strict";
import {
  createDecisionEvidence,
  sumDecisionEvidence,
} from "../app/lib/tripDecisionEvidence.ts";

function evidence(overrides = {}) {
  return createDecisionEvidence({
    id: "events:base",
    signal: "events",
    label: "Base plan event signal",
    availability: "available",
    provenance: "backend:event-calendar",
    freshness: {
      status: "current",
      observedAt: "2026-08-31T12:00:00Z",
      detail: "Current event-intelligence response.",
    },
    confidence: "high",
    contribution: 2.26,
    explanation: "Official event evidence is loaded.",
    ...overrides,
  });
}

test("available current evidence keeps a finite rounded contribution", () => {
  const item = evidence();
  assert.equal(item.contribution, 2.3);
  assert.equal(item.availability, "available");
  assert.equal(item.freshness.status, "current");
});

test("every unusable availability state is explicit and neutral", () => {
  for (const availability of ["unavailable", "out_of_horizon", "stale", "not_assignable"]) {
    const item = evidence({ availability, contribution: 99 });
    assert.equal(item.availability, availability);
    assert.equal(item.contribution, 0);
  }
});

test("stale freshness and non-finite values cannot enter the score", () => {
  assert.equal(evidence({
    freshness: { status: "stale", detail: "Expired source response." },
    contribution: 12,
  }).contribution, 0);
  assert.equal(evidence({ contribution: Number.POSITIVE_INFINITY }).contribution, 0);
  assert.equal(evidence({ contribution: Number.NaN }).contribution, 0);
});

test("signal totals are deterministic and can be filtered by source kind", () => {
  const items = [
    evidence({ id: "events:base", contribution: 2 }),
    evidence({ id: "reservations:base", signal: "reservations", contribution: 4 }),
    evidence({ id: "crowds:base", signal: "historical_crowds", contribution: -1 }),
    evidence({ id: "weather:base", signal: "weather", availability: "out_of_horizon", contribution: 50 }),
  ];

  assert.equal(sumDecisionEvidence(items), 5);
  assert.equal(sumDecisionEvidence(items, "events"), 2);
  assert.equal(sumDecisionEvidence(items, "weather"), 0);
});
