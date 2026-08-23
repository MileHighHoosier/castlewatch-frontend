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
