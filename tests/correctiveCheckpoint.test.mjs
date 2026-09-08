import test from "node:test";
import assert from "node:assert/strict";
import { applyFamilyTripPayload, buildLocalFamilyTripPayload, fingerprintFamilyTripPayload, saveFamilyTrip, saveFamilySyncMetadata, createFamilySyncMetadata, FAMILY_PAYLOAD_EXTENSIONS_STORAGE_KEY } from "../app/lib/familyTripSync.ts";
import { loadReservations, loadRawReservations, validReservationCollection, RESERVATION_STORAGE_KEY, DEFAULT_TRIP_PROFILE, newReservation } from "../app/lib/tripProfile.ts";
import { DEFAULT_RESORT_PLAN } from "../app/lib/tripResorts.ts";
import { DEFAULT_TRIP_WEEK_APPROVAL } from "../app/lib/tripWeekApproval.ts";
import { tripDateKey, calendarDay } from "../app/lib/tripDate.ts";
import { loadTripWeatherSnapshot, WEATHER_AUTO_CHECKED_STORAGE_KEY, WEATHER_AUTO_MODE_STORAGE_KEY, WEATHER_AUTO_FRESHNESS_STORAGE_KEY } from "../app/lib/weatherReliability.ts";
import { scenarioWeatherEvidence } from "../app/lib/tripDecisionPlanningSignals.ts";
import { subscribeDecisionClock } from "../app/lib/decisionClock.ts";

function payload() {
  return { schemaVersion: 1, tripProfile: {...DEFAULT_TRIP_PROFILE}, reservations: [], resortPlan: {...DEFAULT_RESORT_PLAN}, approval: {...DEFAULT_TRIP_WEEK_APPROVAL} };
}
function storage(t) {
  const entries = new Map();
  const previous = global.window;
  global.window = {localStorage: { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) }};
  t.after(() => { global.window = previous; });
  return entries;
}

test("apply/build preserves future root fields and nested approval extensions without phantom changes", (t) => {
  storage(t);
  const remote = {...payload(), bookingTargets: [{id: "future", detail: {version: 2}}], futureFlag: false};
  remote.approval.futureReview = {reviewed: true};
  applyFamilyTripPayload(remote);
  assert.equal(fingerprintFamilyTripPayload(buildLocalFamilyTripPayload()), fingerprintFamilyTripPayload(remote));
  const older = payload();
  applyFamilyTripPayload(older);
  assert.equal("bookingTargets" in buildLocalFamilyTripPayload(), false, "explicit replacement does not retain stale extensions");
});

test("unsupported schema and malformed downloads leave storage unchanged", (t) => {
  const entries = storage(t);
  applyFamilyTripPayload(payload());
  const before = [...entries];
  for (const value of [{...payload(), schemaVersion: 2}, {...payload(), reservations: [null]}]) {
    assert.throws(() => applyFamilyTripPayload(value));
    assert.deepEqual([...entries], before);
  }
});

test("upgraded browsers preserve metadata-only extensions; damaged sidecars do not crash; future schema is not downcast", async (t) => {
  const entries = storage(t);
  saveFamilySyncMetadata(createFamilySyncMetadata(2, {...payload(), bookingTargets: [{id:"retained"}]}));
  for (const raw of ["null", "[]", "broken"]) {
    entries.set(FAMILY_PAYLOAD_EXTENSIONS_STORAGE_KEY, raw);
    assert.deepEqual(buildLocalFamilyTripPayload().bookingTargets,[{id:"retained"}]);
  }
  entries.set(FAMILY_PAYLOAD_EXTENSIONS_STORAGE_KEY, JSON.stringify({...payload(),schemaVersion:2}));
  assert.equal(buildLocalFamilyTripPayload().schemaVersion,2);
  await assert.rejects(saveFamilyTrip({mode:"family_key",familyKey:"test"},2,buildLocalFamilyTripPayload()),/newer browser/);
});

test("malformed local data is safe to render but never silently cleaned or uploaded", async (t) => {
  const entries = storage(t);
  const previousFetch = global.fetch;
  let requests = 0;
  global.fetch = async () => { requests++; throw new Error("unexpected request"); };
  t.after(() => { global.fetch = previousFetch; });
  for (const raw of ["[null]", "{}", "not-json", '[{"id":"incomplete"}]']) {
    entries.set(RESERVATION_STORAGE_KEY, raw);
    assert.deepEqual(loadReservations(), []);
    assert.equal(validReservationCollection(loadRawReservations()), false);
    await assert.rejects(saveFamilyTrip({mode: "family_key", familyKey: "test"}, 1, buildLocalFamilyTripPayload()), /Invalid reservation/);
    assert.equal(entries.get(RESERVATION_STORAGE_KEY), raw);
  }
  assert.equal(requests, 0);
});

test("reservation boundary rejects invalid enums, dates, times, numbers and duplicate IDs; permits editable blanks and extensions", () => {
  const row = newReservation();
  for (const patch of [{status: "maybe"}, {type: "unknown"}, {date: "2027-02-29"}, {time: "25:00"}, {durationMinutes: -1}, {arrivalBufferMinutes: Infinity}, {id: ""}]) {
    assert.equal(validReservationCollection([{...row, ...patch}]), false);
  }
  assert.equal(validReservationCollection([row, row]), false);
  assert.equal(validReservationCollection([{...row, date: "", time: "", future: {x: 1}}]), true);
});

test("trip calendar uses Orlando across UTC midnight, DST transitions and invalid dates", () => {
  assert.equal(tripDateKey("2027-10-10T01:00:00Z"), "2027-10-09");
  assert.equal(tripDateKey("2027-03-14T04:30:00Z"), "2027-03-13");
  assert.equal(tripDateKey("2027-03-14T07:30:00Z"), "2027-03-14");
  assert.equal(tripDateKey("2027-11-07T05:30:00Z"), "2027-11-07");
  assert.equal(tripDateKey("2027-11-07T06:30:00Z"), "2027-11-07");
  assert.equal(calendarDay("2027-02-29"), null);
  assert.notEqual(calendarDay("2028-02-29"), null);
  assert.equal(tripDateKey("invalid"), null);
});

test("automatic weather is assigned to Orlando date and requires a valid non-future timestamp", () => {
  const values = new Map([[WEATHER_AUTO_CHECKED_STORAGE_KEY,"2027-10-10T01:00:00Z"], [WEATHER_AUTO_MODE_STORAGE_KEY,"storm"], [WEATHER_AUTO_FRESHNESS_STORAGE_KEY,"current"]]);
  const snapshot = loadTripWeatherSnapshot({getItem: (key) => values.get(key) ?? null});
  assert.equal(snapshot.forecastDate, "2027-10-09");
  const day = [{date: "2027-10-09", park: "Magic Kingdom"}];
  assert.equal(scenarioWeatherEvidence(day, snapshot, "2027-10-10T01:05:00Z")[0].contribution, 4);
  for (const observedAt of [null,"invalid","2027-10-10T02:00:00Z"]) {
    assert.equal(scenarioWeatherEvidence(day, {...snapshot, observedAt}, "2027-10-10T01:05:00Z")[0].contribution, 0);
  }
  assert.equal(scenarioWeatherEvidence(day, snapshot, "invalid")[0].contribution, 0);
});

test("open-page clock expires unchanged weather and cleans up its timer/listeners", () => {
  let current = "2027-10-10T16:00:00Z";
  let timer;
  let cleared = false;
  const listeners = new Map();
  const runtime = {setInterval: (fn, ms) => {assert.equal(ms, 60000); timer = fn; return 1;}, clearInterval: () => {cleared = true;}, addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: (event) => listeners.delete(event)};
  const snapshot = {mode: "storm", source: "auto", forecastDate: "2027-10-10", observedAt: "2027-10-10T10:00:00Z", freshness: "current", headline: null};
  let evidence;
  const stop = subscribeDecisionClock((now) => { evidence = scenarioWeatherEvidence([{date:"2027-10-10", park:"Epcot"}], snapshot, now)[0]; }, runtime, () => new Date(current));
  assert.equal(evidence.contribution, 4, "six hours inclusive");
  current = "2027-10-10T16:01:00Z";
  timer();
  assert.equal(evidence.availability, "stale");
  assert.equal(evidence.contribution, 0);
  current = "2027-10-11T04:00:00Z";
  listeners.get("focus")();
  assert.equal(evidence.availability, "out_of_horizon");
  stop();
  assert.equal(cleared, true);
  assert.equal(listeners.size, 0);
});

test("weather calendar horizon includes today and day seven, excludes past and day eight across DST", () => {
  const now = "2027-03-14T04:30:00Z"; // Orlando March 13, before the spring transition.
  for (const [date, expected] of [["2027-03-12",0],["2027-03-13",4],["2027-03-20",4],["2027-03-21",0]]) {
    const snapshot = {mode:"storm",source:"manual",forecastDate:date,observedAt:null,freshness:"current",headline:null};
    assert.equal(scenarioWeatherEvidence([{date,park:"Epcot"}],snapshot,now)[0].contribution,expected);
  }
});
