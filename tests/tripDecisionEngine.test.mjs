import test from "node:test";
import assert from "node:assert/strict";
import { buildTripWeekDecision } from "../app/lib/tripDecisionEngine.ts";
import { DEFAULT_TRIP_PROFILE } from "../app/lib/tripProfile.ts";
import { DEFAULT_RESORT_PLAN } from "../app/lib/tripResorts.ts";

const BASE_DAYS = [
  { date: "2027-10-10", park: "Magic Kingdom" },
  { date: "2027-10-11", park: "Hollywood Studios" },
  { date: "2027-10-13", park: "Epcot" },
  { date: "2027-10-14", park: "Animal Kingdom" },
];

const ALTERNATE_DAYS = [
  { date: "2027-10-10", park: "Epcot" },
  { date: "2027-10-11", park: "Hollywood Studios" },
  { date: "2027-10-13", park: "Magic Kingdom" },
  { date: "2027-10-14", park: "Animal Kingdom" },
];

const PROFILE = {
  ...DEFAULT_TRIP_PROFILE,
  childAges: "6, 9",
  noParkHopping: true,
};

const RESOLVED_RESORT_PLAN = {
  ...DEFAULT_RESORT_PLAN,
  "2027-10-09": "pop",
  "2027-10-10": "pop",
  "2027-10-11": "pop",
  "2027-10-13": "pop",
  "2027-10-14": "pop",
};

function forecast(comparison = "near_typical", confidence = "Higher confidence") {
  return {
    status: "ready",
    comparison,
    confidence: { label: confidence },
  };
}

function daysWithForecast(days, overrides = {}) {
  return days.map((day) => ({
    ...day,
    forecast: forecast(overrides[day.date] || "near_typical"),
  }));
}

function intelligence({
  overallStatus = "official",
  recommendationStatus = "recommend_base",
  baseRisk = 0,
  alternateRisk = 0,
  parkHoursStatus = "official",
} = {}) {
  return {
    overall_status: overallStatus,
    recommendation: { status: recommendationStatus },
    scenarios: {
      base: { event_risk_score: baseRisk, reasons: [] },
      alternate: { event_risk_score: alternateRisk, reasons: [] },
    },
    sources: [
      { id: "park_hours", data_status: parkHoursStatus },
    ],
  };
}

function reservation(overrides = {}) {
  return {
    id: "savis-workshop",
    type: "experience",
    title: "Savi's Workshop",
    date: "2027-10-11",
    time: "14:00",
    location: "Hollywood Studios",
    status: "confirmed",
    durationMinutes: 45,
    arrivalBufferMinutes: 20,
    notes: "",
    ...overrides,
  };
}

function decision(overrides = {}) {
  return buildTripWeekDecision({
    baseDays: daysWithForecast(BASE_DAYS),
    alternateDays: daysWithForecast(ALTERNATE_DAYS),
    intelligence: intelligence(),
    reservations: [reservation()],
    resortPlan: RESOLVED_RESORT_PLAN,
    profile: PROFILE,
    ...overrides,
  });
}

test("an unreleased calendar keeps the park order provisional and returns Wait", () => {
  const result = decision({
    intelligence: intelligence({
      overallStatus: "provisional",
      recommendationStatus: "wait_for_calendar",
      parkHoursStatus: "unreleased",
    }),
  });

  assert.equal(result.status, "wait");
  assert.match(result.headline, /provisional|wait/i);
  assert.ok(result.blockers.includes("Official 2027 MNSSHP dates are not loaded."));
  const calendarReadiness = result.readiness.find((item) => item.id === "calendar");
  assert.equal(calendarReadiness?.status, "pending");
  assert.match(calendarReadiness?.detail || "", /not released/i);
  assert.equal(result.readiness.find((item) => item.id === "weather")?.status, "pending");
  assert.equal(result.readiness.find((item) => item.id === "lightning-lane")?.status, "pending");
  assert.ok(result.nextActions.some((action) => action.includes("marked provisional")));
});

test("a confirmed reservation conflict blocks an otherwise lower-risk alternate", () => {
  const conflictingReservation = reservation({
    id: "akershus",
    title: "Akershus Royal Banquet Hall",
    date: "2027-10-13",
    location: "Epcot",
  });
  const result = decision({
    intelligence: intelligence({
      recommendationStatus: "recommend_swap",
      baseRisk: 20,
      alternateRisk: 0,
    }),
    reservations: [conflictingReservation],
  });

  assert.equal(result.preferredScenario, "alternate");
  assert.equal(result.status, "review");
  assert.equal(result.scenarios.alternate.affectedConfirmed.length, 1);
  assert.ok(result.blockers.some((blocker) => blocker.includes("confirmed reservation")));
  assert.ok(result.nextActions.includes("Review confirmed bookings before changing the park order."));
});

test("no-park-hopping increases the cost of a cross-park reservation conflict", () => {
  const conflictingReservation = reservation({
    id: "akershus-no-hopping",
    title: "Akershus Royal Banquet Hall",
    date: "2027-10-13",
    location: "Epcot",
  });
  const common = {
    reservations: [conflictingReservation],
    intelligence: intelligence({ recommendationStatus: "recommend_swap" }),
  };

  const withoutParkHopping = decision(common);
  const withParkHopping = decision({
    ...common,
    profile: { ...PROFILE, noParkHopping: false },
  });

  assert.equal(withoutParkHopping.scenarios.alternate.reservationRisk, 8);
  assert.equal(withParkHopping.scenarios.alternate.reservationRisk, 5);
});

test("an officially supported clean alternate returns Swap with manual approval", () => {
  const result = decision({
    intelligence: intelligence({
      recommendationStatus: "recommend_swap",
      baseRisk: 8,
      alternateRisk: 0,
    }),
  });

  assert.equal(result.preferredScenario, "alternate");
  assert.equal(result.status, "swap");
  assert.ok(result.nextActions.some((action) => /manually approve the swap/i.test(action)));
  assert.equal(result.blockers.length, 0);
});

test("a clean base plan returns Keep and remains user controlled", () => {
  const result = decision({
    intelligence: intelligence({
      recommendationStatus: "recommend_base",
      baseRisk: 0,
      alternateRisk: 8,
    }),
  });

  assert.equal(result.preferredScenario, "base");
  assert.equal(result.status, "keep");
  assert.ok(result.nextActions.some((action) => /keep the park order/i.test(action)));
  assert.equal(result.blockers.length, 0);
});

test("each scenario exposes the typed evidence contract and totals its contributions", () => {
  const result = decision();
  const expectedProvenance = new Set([
    "backend:event-calendar",
    "backend:historical-forecast",
    "browser:trip-reservations",
    "browser:resort-plan",
  ]);

  for (const scenario of Object.values(result.scenarios)) {
    assert.ok(scenario.evidence.length >= 10);
    for (const item of scenario.evidence) {
      assert.ok(item.id);
      assert.ok(item.signal);
      assert.ok(item.availability);
      assert.ok(expectedProvenance.has(item.provenance));
      assert.ok(item.freshness?.status);
      assert.ok(item.freshness?.detail);
      assert.ok(item.confidence);
      assert.equal(Number.isFinite(item.contribution), true);
      assert.ok(item.explanation);
    }
    const evidenceTotal = scenario.evidence.reduce((sum, item) => sum + item.contribution, 0);
    assert.equal(scenario.score, Math.round(evidenceTotal * 10) / 10);
  }
});

test("unavailable and stale evidence is explicit and contributes zero", () => {
  const staleIntelligence = intelligence({
    overallStatus: "stale",
    recommendationStatus: "recommend_base",
    baseRisk: 25,
    alternateRisk: 10,
  });
  const unavailableForecasts = BASE_DAYS.map((day) => ({
    ...day,
    forecast: { status: "unavailable" },
  }));
  const unavailableAlternateForecasts = ALTERNATE_DAYS.map((day) => ({
    ...day,
    forecast: { status: "unavailable" },
  }));

  const result = decision({
    intelligence: staleIntelligence,
    baseDays: unavailableForecasts,
    alternateDays: unavailableAlternateForecasts,
  });

  for (const scenario of Object.values(result.scenarios)) {
    const staleEvent = scenario.evidence.find((item) => item.signal === "events");
    assert.equal(staleEvent?.availability, "stale");
    assert.equal(staleEvent?.freshness.status, "stale");
    assert.equal(staleEvent?.contribution, 0);
    assert.equal(scenario.eventRisk, 0);

    const unavailableCrowds = scenario.evidence.filter((item) => item.signal === "historical_crowds");
    assert.ok(unavailableCrowds.length > 0);
    assert.ok(unavailableCrowds.every((item) => item.availability === "unavailable"));
    assert.ok(unavailableCrowds.every((item) => item.contribution === 0));
    assert.equal(scenario.forecastRisk, 0);
  }
});

test("an unknown origin resort is not assignable and does not silently fall back", () => {
  const result = decision({
    resortPlan: {
      ...RESOLVED_RESORT_PLAN,
      "2027-10-09": "unknown-resort",
    },
  });

  const baseEvidence = result.scenarios.base.evidence.find(
    (item) => item.signal === "transportation" && item.affectedDate === "2027-10-10",
  );
  const alternateEvidence = result.scenarios.alternate.evidence.find(
    (item) => item.signal === "transportation" && item.affectedDate === "2027-10-10",
  );
  assert.equal(baseEvidence?.availability, "not_assignable");
  assert.equal(baseEvidence?.contribution, 0);
  assert.equal(alternateEvidence?.availability, "not_assignable");
  assert.equal(alternateEvidence?.contribution, 0);
});

test("base and alternate transportation evidence follows the dated overnight resort", () => {
  const result = decision({ resortPlan: DEFAULT_RESORT_PLAN });
  assert.equal(result.scenarios.base.resortTravelRisk, 6);
  assert.equal(result.scenarios.alternate.resortTravelRisk, 8);

  const baseEpcot = result.scenarios.base.evidence.find(
    (item) => item.signal === "transportation" && item.affectedDate === "2027-10-13",
  );
  assert.equal(baseEpcot?.affectedPark, "Epcot");
  assert.equal(baseEpcot?.contribution, 0);
  assert.match(baseEpcot?.explanation || "", /Beach Club.*International Gateway/i);
  assert.match(baseEpcot?.explanation || "", /2027-10-12 overnight stay/i);

  const alternateMagicKingdom = result.scenarios.alternate.evidence.find(
    (item) => item.signal === "transportation" && item.affectedDate === "2027-10-13",
  );
  assert.equal(alternateMagicKingdom?.affectedPark, "Magic Kingdom");
  assert.equal(alternateMagicKingdom?.contribution, 2);
  assert.match(alternateMagicKingdom?.explanation || "", /Beach Club.*Magic Kingdom/i);
});

test("baseline outcomes remain stable across keep, swap, wait and review fixtures", () => {
  const fixtures = [
    {
      name: "keep",
      expected: "keep",
      overrides: { intelligence: intelligence({ baseRisk: 0, alternateRisk: 8 }) },
    },
    {
      name: "swap",
      expected: "swap",
      overrides: { intelligence: intelligence({ recommendationStatus: "recommend_swap", baseRisk: 8, alternateRisk: 0 }) },
    },
    {
      name: "wait",
      expected: "wait",
      overrides: { intelligence: intelligence({ overallStatus: "provisional", recommendationStatus: "wait_for_calendar", parkHoursStatus: "unreleased" }) },
    },
    {
      name: "review",
      expected: "review",
      overrides: {
        intelligence: intelligence({ recommendationStatus: "recommend_swap", baseRisk: 20, alternateRisk: 0 }),
        reservations: [reservation({ date: "2027-10-13", location: "Epcot" })],
      },
    },
  ];

  for (const fixture of fixtures) {
    const result = decision(fixture.overrides);
    assert.equal(result.status, fixture.expected, fixture.name);
  }
});
