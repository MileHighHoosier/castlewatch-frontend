import test from "node:test";
import assert from "node:assert/strict";
import {
  emergencyBreakPlanForPark,
  emergencyWeatherGuidance,
  isEmergencyModeValueActive,
  resolveEmergencyWeatherRisk,
  shouldRefreshEmergencyContent,
} from "../app/components/EmergencyBreakMode.tsx";

test("emergency mode keeps a park-specific stop and exit plan for all four parks", () => {
  const expectations = [
    ["Magic Kingdom", /Main Street|resort loop/],
    ["Epcot", /nearest gate/],
    ["Hollywood Studios", /Skyliner, bus, or boat/],
    ["Animal Kingdom", /shade first/],
  ];

  for (const [park, titlePattern] of expectations) {
    const plan = emergencyBreakPlanForPark(park);
    assert.match(plan.title, titlePattern);
    assert.equal(plan.steps.length, 3);
    assert.match(plan.steps[0], /Stop the current ride plan/);
    assert.ok(plan.note.length > 20);
  }
});

test("an unknown park falls back to the conservative Magic Kingdom plan", () => {
  assert.deepEqual(
    emergencyBreakPlanForPark("Unknown Park"),
    emergencyBreakPlanForPark("Magic Kingdom"),
  );
});

test("automatic weather risk applies unless the same-day manual state supersedes it", () => {
  assert.equal(resolveEmergencyWeatherRisk("storm", "normal", false), "storm");
  assert.equal(resolveEmergencyWeatherRisk("hot", "normal", true), "normal");
  assert.equal(resolveEmergencyWeatherRisk("storm", "hot", true), "hot");
  assert.equal(resolveEmergencyWeatherRisk("invalid", "invalid", false), "normal");
});

test("emergency weather guidance prioritizes heat recovery and storm shelter", () => {
  assert.match(emergencyWeatherGuidance("hot"), /shade, A\/C, water/);
  assert.match(emergencyWeatherGuidance("hot"), /Do not chase one more ride/);
  assert.match(emergencyWeatherGuidance("storm"), /safe shelter/);
  assert.equal(emergencyWeatherGuidance("normal"), "");
});

test("only the explicit persisted on state activates emergency mode", () => {
  assert.equal(isEmergencyModeValueActive("on"), true);
  assert.equal(isEmergencyModeValueActive("off"), false);
  assert.equal(isEmergencyModeValueActive("true"), false);
  assert.equal(isEmergencyModeValueActive(null), false);
});

test("an active emergency overlay refreshes when the park or weather risk changes", () => {
  const magicKingdom = emergencyBreakPlanForPark("Magic Kingdom");
  const epcot = emergencyBreakPlanForPark("Epcot");

  assert.equal(shouldRefreshEmergencyContent(magicKingdom.title, "normal", magicKingdom, "normal"), false);
  assert.equal(shouldRefreshEmergencyContent(magicKingdom.title, "normal", epcot, "normal"), true);
  assert.equal(shouldRefreshEmergencyContent(magicKingdom.title, "hot", magicKingdom, "storm"), true);
  assert.equal(shouldRefreshEmergencyContent(magicKingdom.title, "storm", magicKingdom, "normal"), true);
  assert.equal(shouldRefreshEmergencyContent(undefined, undefined, magicKingdom, "normal"), true);
});
