import test from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_TARGETS_STORAGE_KEY,
  calculateBookingWindow,
  loadBookingTargets,
  loadRawBookingTargets,
  normalizeBookingTargets,
  saveBookingTargets,
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

test("local booking-target storage renders malformed data safely and refuses lossy edits", (t) => {
  const entries = storage(t);
  entries.set(BOOKING_TARGETS_STORAGE_KEY, JSON.stringify({ malformed: true }));
  assert.deepEqual(loadBookingTargets(), []);
  assert.deepEqual(loadRawBookingTargets(), { malformed: true });
  assert.throws(() => saveBookingTargets([{ id: "partial" }]), /Invalid booking-target data/);
  assert.equal(entries.get(BOOKING_TARGETS_STORAGE_KEY), JSON.stringify({ malformed: true }));

  saveBookingTargets([target()]);
  assert.deepEqual(loadBookingTargets(), [target()]);
});

test("family sync preserves valid, malformed, and absent booking-target payloads exactly", (t) => {
  storage(t);
  for (const source of [payload([target()]), payload({ futureShape: 2 }), payload()]) {
    const applied = applyFamilyTripPayload(source);
    assert.deepEqual(applied.bookingTargets, Array.isArray(source.bookingTargets) ? source.bookingTargets : []);
    assert.equal(
      fingerprintFamilyTripPayload(buildLocalFamilyTripPayload()),
      fingerprintFamilyTripPayload(source),
    );
  }
  assert.equal("bookingTargets" in buildLocalFamilyTripPayload(), false);
});
