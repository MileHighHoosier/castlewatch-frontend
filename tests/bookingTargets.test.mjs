import test from "node:test";
import assert from "node:assert/strict";
import { lockManager } from "./bookingTargetLockFixture.mjs";
import { withBookingTargetsWriteLock } from "../app/lib/bookingTargetWriteLock.ts";
import { applyBookingLifecycleAction } from "../app/lib/bookingTargetLifecycle.ts";
import {
  BOOKING_TARGETS_STORAGE_KEY,
  calculateBookingWindow,
  loadBookingTargets,
  loadRawBookingTargets,
  normalizeBookingTargets,
  saveBookingTargets,
  updateBookingTargets,
  validBookingTargetCollection,
} from "../app/lib/bookingTargets.ts";
import {
  applyFamilyTripPayload,
  buildLocalFamilyTripPayload,
  fingerprintFamilyTripPayload,
} from "../app/lib/familyTripSync.ts";
import { DEFAULT_TRIP_PROFILE } from "../app/lib/tripProfile.ts";
import { DEFAULT_RESORT_PLAN } from "../app/lib/tripResorts.ts";
import { DEFAULT_TRIP_WEEK_APPROVAL } from "../app/lib/tripWeekApproval.ts";

function target(patch = {}) {
  return {
    id: "bbb-2027",
    title: "Bibbidi Bobbidi Boutique",
    targetType: "experience",
    priority: "must_do",
    desiredTripDate: "2027-10-09",
    status: "planned",
    bookingRule: {
      provenance: {
        source: "Family planning research",
        sourceUrl: null,
        asOfDate: "2026-09-08",
      },
      verification: "verified",
      openingDaysBeforeTrip: 60,
      deadlineDaysBeforeTrip: 1,
    },
    manualOverride: null,
    linkedReservationId: null,
    notes: "",
    ...patch,
  };
}

function payload(bookingTargetsMarker = Symbol.for("absent")) {
  const value = {
    schemaVersion: 1,
    tripProfile: { ...DEFAULT_TRIP_PROFILE },
    reservations: [],
    resortPlan: { ...DEFAULT_RESORT_PLAN },
    approval: { ...DEFAULT_TRIP_WEEK_APPROVAL },
  };
  if (bookingTargetsMarker !== Symbol.for("absent")) value.bookingTargets = bookingTargetsMarker;
  return value;
}

function storage(t) {
  const entries = new Map();
  const previous = global.window;
  global.window = {
    dispatchEvent: () => true,
    navigator: { locks: lockManager() },
    localStorage: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: (key) => entries.delete(key),
    },
  };
  t.after(() => { global.window = previous; });
  return entries;
}

test("booking-target normalization accepts only complete, unique collections", () => {
  const valid = [target(), target({ id: "dining-2027", targetType: "dining", priority: "high" })];
  assert.equal(validBookingTargetCollection(valid), true);
  assert.deepEqual(normalizeBookingTargets(valid), valid);
  for (const malformed of [undefined, null, {}, [null], [target(), target()], [target({ desiredTripDate: "2027-02-29" })], [target({ priority: "urgent" })]]) {
    assert.deepEqual(normalizeBookingTargets(malformed), []);
  }
});

test("booking windows use deterministic calendar-day arithmetic across month and leap boundaries", () => {
  const october = calculateBookingWindow(target());
  assert.equal(october.planningTimeZone, "America/New_York");
  assert.deepEqual(october.opening, {
    date: "2027-08-10",
    source: "calculated",
    status: "ready",
    detail: "Calculated 60 days before the desired trip date.",
  });
  assert.equal(october.deadline.date, "2027-10-08");

  const leap = calculateBookingWindow(target({
    desiredTripDate: "2028-03-01",
    bookingRule: {
      ...target().bookingRule,
      openingDaysBeforeTrip: 1,
      deadlineDaysBeforeTrip: 0,
    },
  }));
  assert.equal(leap.opening.date, "2028-02-29");
  assert.equal(leap.deadline.date, "2028-03-01");
});

test("unverified rules remain explicit and unavailable rules do not invent dates", () => {
  const unverified = calculateBookingWindow(target({
    bookingRule: { ...target().bookingRule, verification: "needs_verification" },
  }));
  assert.equal(unverified.opening.date, "2027-08-10");
  assert.equal(unverified.opening.status, "needs_verification");
  assert.match(unverified.opening.detail, /verify the rule/i);

  const unavailable = calculateBookingWindow(target({ bookingRule: null }));
  assert.equal(unavailable.ruleVerification, "unavailable");
  assert.equal(unavailable.opening.date, null);
  assert.equal(unavailable.deadline.date, null);
  assert.equal(unavailable.opening.status, "unavailable");
});

test("manual dates override only their corresponding calculated fields", () => {
  const result = calculateBookingWindow(target({
    manualOverride: {
      openingDate: "2027-08-12",
      deadlineDate: null,
      note: "Family-selected call date",
    },
  }));
  assert.deepEqual(result.opening, {
    date: "2027-08-12",
    source: "manual_override",
    status: "ready",
    detail: "Using the family's manual opening date.",
  });
  assert.equal(result.deadline.date, "2027-10-08");
  assert.equal(result.deadline.source, "calculated");
});

test("inconsistent or malformed rules fail neutral without changing itinerary data", () => {
  const inconsistent = calculateBookingWindow(target({
    bookingRule: {
      ...target().bookingRule,
      openingDaysBeforeTrip: 1,
      deadlineDaysBeforeTrip: 60,
    },
  }));
  assert.equal(inconsistent.opening.date, null);
  assert.equal(inconsistent.opening.status, "invalid");
  assert.equal(inconsistent.deadline.date, null);

  const partialOverride = calculateBookingWindow(target({
    bookingRule: {
      ...target().bookingRule,
      openingDaysBeforeTrip: 1,
      deadlineDaysBeforeTrip: 60,
    },
    manualOverride: {
      openingDate: "2027-08-12",
      deadlineDate: null,
      note: "Opening date checked by family",
    },
  }));
  assert.equal(partialOverride.opening.source, "manual_override");
  assert.equal(partialOverride.opening.date, "2027-08-12");
  assert.equal(partialOverride.deadline.status, "invalid");
  assert.equal(partialOverride.deadline.date, null);

  const malformed = calculateBookingWindow({ id: "partial" });
  assert.equal(malformed.targetId, null);
  assert.equal(malformed.opening.status, "invalid");
});

test("local booking-target storage renders malformed data safely and refuses lossy edits", async (t) => {
  const entries = storage(t);
  entries.set(BOOKING_TARGETS_STORAGE_KEY, JSON.stringify({ malformed: true }));
  assert.deepEqual(loadBookingTargets(), []);
  assert.deepEqual(loadRawBookingTargets(), { malformed: true });
  assert.throws(() => saveBookingTargets([{ id: "partial" }]), /Invalid booking-target data/);
  await assert.rejects(updateBookingTargets(() => [target()]), /unsupported shape/);
  assert.equal(entries.get(BOOKING_TARGETS_STORAGE_KEY), JSON.stringify({ malformed: true }));

  saveBookingTargets([target()]);
  assert.deepEqual(loadBookingTargets(), [target()]);
});

test("a stale planner write preserves valid targets added by another tab", async (t) => {
  storage(t);
  const stalePlannerSnapshot = [target()];
  saveBookingTargets(stalePlannerSnapshot);

  const otherTabTarget = target({
    id: "dining-2027",
    title: "Cinderella's Royal Table",
    targetType: "dining",
    priority: "high",
  });
  saveBookingTargets([...stalePlannerSnapshot, otherTabTarget]);

  const saved = await updateBookingTargets((current) => current.map((row) => (
    row.id === stalePlannerSnapshot[0].id ? { ...row, notes: "Updated from the stale tab" } : row
  )));

  assert.deepEqual(saved.map((row) => row.id), ["bbb-2027", "dining-2027"]);
  assert.equal(saved[0].notes, "Updated from the stale tab");
  assert.deepEqual(saved[1], otherTabTarget);
  assert.deepEqual(loadBookingTargets(), saved);
});

test("a second tab requesting a write after the first read cannot interleave its save", async (t) => {
  storage(t);
  const operations = {
    add: (rows) => [...rows, target({ id: "tab-a-added" })],
    edit: (rows) => rows.map((row) => ({ ...row, notes: "Tab A edit" })),
    clearRule: (rows) => rows.map((row) => ({ ...row, bookingRule: null })),
    clearOverrides: (rows) => rows.map((row) => ({ ...row, manualOverride: null })),
    remove: (rows) => rows.filter((row) => row.id !== "bbb-2027"),
  };
  for (const [name, operation] of Object.entries(operations)) {
    const initial = [target({ manualOverride: { openingDate: "2027-08-10", deadlineDate: null, note: "Family date" }, futureField: { keep: true } })];
    saveBookingTargets(initial);
    const other = target({ id: "tab-b-added", futureField: { keep: "B" } });
    let second;
    let secondRan = false;
    await updateBookingTargets((current) => {
      // Tab B requests its mutation exactly between A's read and write.
      second = updateBookingTargets((latest) => {
        secondRan = true;
        assert.deepEqual(latest, operation(initial), name + " must commit before B reads");
        return [...latest, other];
      });
      assert.equal(secondRan, false);
      return operation(current);
    });
    await second;
    assert.deepEqual(loadBookingTargets(), [...operation(initial), other], name);
  }
});

test("a queued lifecycle attempt uses the latest valid target collection", async (t) => {
  storage(t);
  const initial = [target({ futureField: { keep: "phase-2a" } })];
  saveBookingTargets(initial);
  const other = target({ id: "tab-b-target", title: "Tab B target" });
  let lifecycleWrite;
  await updateBookingTargets((current) => {
    lifecycleWrite = updateBookingTargets((latest) => latest.map((row) => row.id === "bbb-2027"
      ? applyBookingLifecycleAction(row, {
        type: "record_attempt",
        attemptId: "tab-a-attempt",
        attemptedOn: "2027-08-10",
        note: "Queued lifecycle action",
      })
      : row));
    return [...current, other];
  });
  await lifecycleWrite;
  const saved = loadBookingTargets();
  assert.deepEqual(saved.map((row) => row.id), ["bbb-2027", "tab-b-target"]);
  assert.deepEqual(saved[0].futureField, { keep: "phase-2a" });
  assert.equal(saved[0].status, "attempted");
  assert.equal(saved[0].attempts[0].note, "Queued lifecycle action");
});

test("queued planner writes validate storage after an explicit shared replacement releases the lock", async (t) => {
  const entries = storage(t);
  for (const raw of [{ futureShape: 2 }, [target({ desiredTripDate: "2027-02-29" })], null]) {
    saveBookingTargets([target()]);
    let release;
    let entered;
    const acquired = new Promise((resolve) => { entered = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    const replacement = withBookingTargetsWriteLock(async () => {
      entered();
      await gate;
      applyFamilyTripPayload(payload(raw));
    });
    await acquired;
    let mutationRan = false;
    const queued = updateBookingTargets((rows) => { mutationRan = true; return [...rows, target({ id: "new" })]; });
    const rejected = assert.rejects(queued, /unsupported shape/);
    release();
    await replacement;
    await rejected;
    assert.equal(mutationRan, false);
    assert.equal(entries.get(BOOKING_TARGETS_STORAGE_KEY), JSON.stringify(raw));
    assert.equal(fingerprintFamilyTripPayload(buildLocalFamilyTripPayload()), fingerprintFamilyTripPayload(payload(raw)));
  }
});

test("unavailable locks and failed writes preserve storage and release queued work", async (t) => {
  const entries = storage(t);
  saveBookingTargets([target()]);
  const before = entries.get(BOOKING_TARGETS_STORAGE_KEY);
  const locks = window.navigator.locks;
  window.navigator.locks = undefined;
  let mutationRan = false;
  await assert.rejects(updateBookingTargets(() => { mutationRan = true; return []; }), /cannot safely coordinate/);
  assert.equal(mutationRan, false);
  assert.equal(entries.get(BOOKING_TARGETS_STORAGE_KEY), before);
  window.navigator.locks = locks;
  const setItem = window.localStorage.setItem;
  window.localStorage.setItem = () => { throw new Error("Storage quota fixture"); };
  await assert.rejects(updateBookingTargets(() => []), /Storage quota fixture/);
  assert.equal(entries.get(BOOKING_TARGETS_STORAGE_KEY), before);
  window.localStorage.setItem = setItem;
  await assert.rejects(updateBookingTargets(() => { throw new Error("Mutation fixture"); }), /Mutation fixture/);
  await updateBookingTargets((rows) => [...rows, target({ id: "after-error" })]);
  assert.equal(loadBookingTargets().length, 2);
});

test("family sync preserves valid, malformed, and absent booking-target payloads exactly", (t) => {
  storage(t);
  const lifecycleTarget = target({
    status: "backup",
    attempts: [{ id: "attempt-1", attemptedOn: "2027-08-10", result: "unavailable", note: "No times found", reservationId: null }],
    fallbackChoice: { title: "Alternate meal", selectedOn: "2027-08-10", note: "Family choice" },
  });
  for (const source of [payload([target()]), payload([lifecycleTarget]), payload({ futureShape: 2 }), payload()]) {
    const applied = applyFamilyTripPayload(source);
    assert.deepEqual(applied.bookingTargets, Array.isArray(source.bookingTargets) ? source.bookingTargets : []);
    assert.equal(
      fingerprintFamilyTripPayload(buildLocalFamilyTripPayload()),
      fingerprintFamilyTripPayload(source),
    );
  }
  assert.equal("bookingTargets" in buildLocalFamilyTripPayload(), false);
});
