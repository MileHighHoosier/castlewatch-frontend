import test from "node:test";
import assert from "node:assert/strict";
import { resolveWeatherRefresh } from "../app/lib/weatherReliability.ts";

const LAST_OK = "2026-08-22T17:00:00.000Z";
const NOW = "2026-08-22T18:00:00.000Z";

function snapshot(overrides = {}) {
  return {
    mode: null,
    headline: null,
    lastSuccessfulCheck: null,
    freshness: "unknown",
    ...overrides,
  };
}

test("a transient failure preserves the last known heat advisory and marks it stale", () => {
  const prior = snapshot({
    mode: "hot",
    headline: "Heat Advisory",
    lastSuccessfulCheck: LAST_OK,
    freshness: "current",
  });

  const decision = resolveWeatherRefresh({
    requestOk: false,
    data: null,
    prior,
    nowIso: NOW,
  });

  assert.deepEqual(decision.snapshot, {
    ...prior,
    freshness: "stale",
  });
  assert.equal(decision.applyAutomaticMode, false);
  assert.equal(decision.clearPreviouslyAutomaticMode, false);
});

test("a failure before any successful weather check is unknown rather than normal", () => {
  const decision = resolveWeatherRefresh({
    requestOk: false,
    data: null,
    prior: snapshot(),
    nowIso: NOW,
  });

  assert.equal(decision.snapshot.mode, null);
  assert.equal(decision.snapshot.freshness, "unknown");
  assert.equal(decision.snapshot.lastSuccessfulCheck, null);
  assert.equal(decision.clearPreviouslyAutomaticMode, false);
});

test("a successful no-advisory response is the only path that clears a prior automatic warning", () => {
  const decision = resolveWeatherRefresh({
    requestOk: true,
    data: {
      advisoryActive: false,
      mode: "normal",
    },
    prior: snapshot({
      mode: "storm",
      headline: "Severe Thunderstorm Warning",
      lastSuccessfulCheck: LAST_OK,
      freshness: "stale",
    }),
    nowIso: NOW,
  });

  assert.deepEqual(decision.snapshot, {
    mode: null,
    headline: null,
    lastSuccessfulCheck: NOW,
    freshness: "current",
  });
  assert.equal(decision.clearPreviouslyAutomaticMode, true);
  assert.equal(decision.applyAutomaticMode, false);
});

test("a valid storm advisory becomes current and requests automatic safe mode", () => {
  const decision = resolveWeatherRefresh({
    requestOk: true,
    data: {
      advisoryActive: true,
      mode: "storm",
      headline: "Tornado Watch",
    },
    prior: snapshot(),
    nowIso: NOW,
  });

  assert.deepEqual(decision.snapshot, {
    mode: "storm",
    headline: "Tornado Watch",
    lastSuccessfulCheck: NOW,
    freshness: "current",
  });
  assert.equal(decision.applyAutomaticMode, true);
  assert.equal(decision.clearPreviouslyAutomaticMode, false);
});

test("a malformed active-advisory payload does not clear a prior guard", () => {
  const prior = snapshot({
    mode: "hot",
    headline: "Excessive Heat Warning",
    lastSuccessfulCheck: LAST_OK,
    freshness: "current",
  });

  const decision = resolveWeatherRefresh({
    requestOk: true,
    data: {
      advisoryActive: true,
      mode: "normal",
    },
    prior,
    nowIso: NOW,
  });

  assert.equal(decision.snapshot.mode, "hot");
  assert.equal(decision.snapshot.headline, "Excessive Heat Warning");
  assert.equal(decision.snapshot.lastSuccessfulCheck, LAST_OK);
  assert.equal(decision.snapshot.freshness, "stale");
  assert.equal(decision.clearPreviouslyAutomaticMode, false);
});
