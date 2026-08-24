import test from "node:test";
import assert from "node:assert/strict";
import {
  compareRopeDropPriority,
  getPressure,
  isOpenRide,
  isPriorityRide,
  normalizeParkName,
  pickPlanRecommendation,
} from "../app/components/ParkCommandCenter.tsx";
import {
  isCoolDownOnly,
  isEligiblePlanRideForState,
  replacementWhyChosen,
  scoreCandidate,
} from "../app/components/PlanModeGuard.tsx";

function ride(overrides = {}) {
  return {
    id: overrides.displayName || "ride",
    displayName: "Dumbo the Flying Elephant",
    displayPark: "Magic Kingdom",
    displayWait: 10,
    displayLand: "Fantasyland",
    is_open: true,
    ...overrides,
  };
}

function rawRide(overrides = {}) {
  return {
    name: "Buzz Lightyear's Space Ranger Spin",
    park: "Magic Kingdom",
    land: "Tomorrowland",
    wait_time: 15,
    is_open: true,
    ...overrides,
  };
}

test("Park Command Center normalizes supported park labels and keeps unknown values explicit", () => {
  assert.equal(normalizeParkName("Disney's Magic Kingdom Park"), "Magic Kingdom");
  assert.equal(normalizeParkName(" EPCOT "), "Epcot");
  assert.equal(normalizeParkName("Disney Hollywood Studios"), "Hollywood Studios");
  assert.equal(normalizeParkName("Disney's Animal Kingdom"), "Animal Kingdom");
  assert.equal(normalizeParkName("Water Park"), "Water Park");
  assert.equal(normalizeParkName(), "Unknown Park");
});

test("closed rides and non-ride attractions stay out of live ride-demand candidates", () => {
  assert.equal(isOpenRide(ride()), true);
  assert.equal(isOpenRide(ride({ is_open: false })), false);
  assert.equal(isPriorityRide(ride({ displayName: "Seven Dwarfs Mine Train" })), true);
  assert.equal(isPriorityRide(ride({ displayName: "Tree of Life", displayLand: "Discovery Island Trails" })), false);
  assert.equal(isPriorityRide(ride({ displayName: "Test Track Single Rider" })), false);
});

test("ride-area pressure boundaries remain stable", () => {
  assert.equal(getPressure(14, 34), "Low");
  assert.equal(getPressure(15, 34), "Moderate");
  assert.equal(getPressure(29, 60), "High");
  assert.equal(getPressure(45, 50), "Very High");
  assert.equal(getPressure(20, 80), "Very High");
});

test("closed-park targets retain the park-specific rope-drop order", () => {
  const targets = [
    ride({ displayName: "Pirates of the Caribbean", displayWait: 5 }),
    ride({ displayName: "TRON Lightcycle / Run", displayWait: 0 }),
    ride({ displayName: "Seven Dwarfs Mine Train", displayWait: 0 }),
  ].sort(compareRopeDropPriority);

  assert.deepEqual(targets.map((item) => item.displayName), [
    "Seven Dwarfs Mine Train",
    "TRON Lightcycle / Run",
    "Pirates of the Caribbean",
  ]);
});

test("Live Plan returns a refresh-first state when no usable ride wait exists", () => {
  const plan = pickPlanRecommendation("lowStress", [
    ride({ displayName: "Closed ride", displayWait: 20, is_open: false }),
    ride({ displayName: "Unknown wait", displayWait: -1 }),
  ]);

  assert.equal(plan.title, "No priority ride to recommend yet");
  assert.equal(plan.subtitle, "No plan yet");
  assert.match(plan.steps[0], /Refresh after park opening/);
});

test("Max rides favors a short-wait headliner with strong ride value", () => {
  const plan = pickPlanRecommendation("aggressive", [
    ride({ displayName: "Seven Dwarfs Mine Train", displayWait: 25 }),
    ride({ displayName: "Dumbo the Flying Elephant", displayWait: 5 }),
  ]);

  assert.equal(plan.title, "Seven Dwarfs Mine Train");
  assert.equal(plan.subtitle, "Next move · Max rides");
  assert.match(plan.reason, /25 min wait/);
});

test("Low-stress mode avoids a hotter headliner when a calmer option is available", () => {
  const hottestZone = {
    land: "Fantasyland",
    rides: [],
    openRides: [],
    averageWait: 45,
    longestWait: 80,
    pressure: "Very High",
  };
  const plan = pickPlanRecommendation("lowStress", [
    ride({ displayName: "Seven Dwarfs Mine Train", displayWait: 30 }),
    ride({ displayName: "Haunted Mansion", displayLand: "Liberty Square", displayWait: 20 }),
  ], hottestZone);

  assert.equal(plan.title, "Haunted Mansion");
  assert.equal(plan.subtitle, "Next move · Low-stress");
  assert.equal(plan.avoid, "Fantasyland");
});

test("Cool down favors a recovery-friendly attraction over a shorter headliner", () => {
  const plan = pickPlanRecommendation("coolDown", [
    ride({ displayName: "Walt Disney's Carousel of Progress", displayLand: "Tomorrowland", displayWait: 20 }),
    ride({ displayName: "Seven Dwarfs Mine Train", displayWait: 5 }),
  ]);

  assert.equal(plan.title, "Walt Disney's Carousel of Progress");
  assert.equal(plan.subtitle, "Next move · Cool down");
  assert.match(plan.reason, /cool-down friendly/);
});

test("a mode with no under-cap option labels the result as a fallback", () => {
  const plan = pickPlanRecommendation("lowStress", [
    ride({ displayName: "Dumbo the Flying Elephant", displayWait: 45 }),
    ride({ displayName: "Seven Dwarfs Mine Train", displayWait: 70 }),
  ]);

  assert.match(plan.subtitle, /Threshold exceeded|Headliner exception/);
  assert.match(plan.reason, /No Low-stress option is under the 35 min cap/);
  assert.match(plan.reason, /fallback, not an ideal/);
});

test("historical opportunity cannot displace an eligible low-stress option with an over-cap ride", () => {
  const overCap = ride({ displayName: "Seven Dwarfs Mine Train", displayWait: 70 });
  const eligible = ride({ displayName: "Dumbo the Flying Elephant", displayWait: 30 });
  const insights = {
    park: "Magic Kingdom",
    best_now: [{
      name: "Seven Dwarfs Mine Train",
      current_wait: 70,
      typical_wait: 120,
      opportunity_score: 50,
      is_open: true,
    }],
  };

  assert.equal(pickPlanRecommendation("lowStress", [overCap, eligible], undefined, insights).title, eligible.displayName);
});

test("the Live Plan guard rejects wrong-park, closed, excluded, unknown-wait and completed rides", () => {
  const completed = new Set(["Buzz Lightyear's Space Ranger Spin"]);
  assert.equal(isEligiblePlanRideForState(rawRide(), "Magic Kingdom", new Set()), true);
  assert.equal(isEligiblePlanRideForState(rawRide({ park: "Epcot" }), "Magic Kingdom", new Set()), false);
  assert.equal(isEligiblePlanRideForState(rawRide({ is_open: false }), "Magic Kingdom", new Set()), false);
  assert.equal(isEligiblePlanRideForState(rawRide({ wait_time: undefined }), "Magic Kingdom", new Set()), false);
  assert.equal(isEligiblePlanRideForState(rawRide({ name: "Carousel of Progress" }), "Magic Kingdom", new Set()), false);
  assert.equal(isEligiblePlanRideForState(rawRide(), "Magic Kingdom", completed), false);
});

test("the Live Plan guard ranks headliners for Max rides and stronger family rides for Low-stress", () => {
  const headliner = rawRide({ name: "Seven Dwarfs Mine Train", land: "Fantasyland", wait_time: 25 });
  const familyRide = rawRide();

  assert.ok(scoreCandidate(headliner, "aggressive") > scoreCandidate(familyRide, "aggressive"));
  assert.ok(scoreCandidate(familyRide, "lowStress") > scoreCandidate(headliner, "lowStress"));
});

test("the Live Plan guard keeps cool-down-only and replacement explanations explicit", () => {
  assert.equal(isCoolDownOnly("Use Carousel of Progress"), true);
  assert.equal(isCoolDownOnly("Seven Dwarfs Mine Train"), false);
  assert.match(replacementWhyChosen(rawRide(), "lowStress"), /stronger low-stress ride with a short wait/);
  assert.match(
    replacementWhyChosen(rawRide({ name: "Seven Dwarfs Mine Train", wait_time: 25 }), "aggressive"),
    /strong ride value/,
  );
});
