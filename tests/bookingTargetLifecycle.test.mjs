import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  applyBookingLifecycleAction,
  summarizeBookingLifecycle,
} from "../app/lib/bookingTargetLifecycle.ts";
import { validBookingTargetCollection } from "../app/lib/bookingTargets.ts";

function target(patch = {}) {
  return {
    id: "bbb-2027",
    title: "Bibbidi Bobbidi Boutique",
    targetType: "experience",
    priority: "must_do",
    desiredTripDate: "2027-10-09",
    status: "planned",
    bookingRule: null,
    manualOverride: null,
    linkedReservationId: null,
    notes: "",
    futureField: { preserve: true },
    ...patch,
  };
}

const reservations = [
  { id: "reservation-bbb", title: "Bibbidi Bobbidi Boutique" },
  { id: "reservation-dinner", title: "Cinderella's Royal Table" },
];

test("Phase 2A targets remain valid without Phase 2C history fields", () => {
  assert.equal(validBookingTargetCollection([target()]), true);
  assert.equal(validBookingTargetCollection([target({ attempts: [], fallbackChoice: null })]), true);
  assert.equal(validBookingTargetCollection([target({ attempts: [{ id: "bad", attemptedOn: "2027-02-29", result: "attempted", note: "", reservationId: null }] })]), false);
  assert.equal(validBookingTargetCollection([target({ fallbackChoice: { title: "", selectedOn: "2027-09-13", note: "" } })]), false);
});

test("attempt and unavailable actions append truthful history without claiming availability", () => {
  const attempted = applyBookingLifecycleAction(target(), {
    type: "record_attempt",
    attemptId: "attempt-1",
    attemptedOn: "2027-08-10",
    note: "Called at opening",
  });
  assert.equal(attempted.status, "attempted");
  assert.deepEqual(attempted.attempts, [{
    id: "attempt-1",
    attemptedOn: "2027-08-10",
    result: "attempted",
    note: "Called at opening",
    reservationId: null,
  }]);

  const unavailable = applyBookingLifecycleAction(attempted, {
    type: "mark_unavailable",
    attemptId: "attempt-2",
    attemptedOn: "2027-08-11",
    note: "Family observed no acceptable times",
  });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.attempts.length, 2);
  assert.equal(unavailable.attempts[1].result, "unavailable");
  assert.deepEqual(unavailable.futureField, { preserve: true });
});

test("attempt actions reject invalid dates and duplicate identifiers", () => {
  assert.throws(() => applyBookingLifecycleAction(target(), {
    type: "record_attempt",
    attemptId: "attempt-1",
    attemptedOn: "2027-02-29",
    note: "",
  }), /valid calendar date/);

  const attempted = applyBookingLifecycleAction(target(), {
    type: "record_attempt",
    attemptId: "attempt-1",
    attemptedOn: "2027-08-10",
    note: "",
  });
  assert.throws(() => applyBookingLifecycleAction(attempted, {
    type: "record_attempt",
    attemptId: "attempt-1",
    attemptedOn: "2027-08-11",
    note: "",
  }), /already been recorded/);
});

test("backup selection is explicit, dated, and does not invent availability", () => {
  assert.throws(() => applyBookingLifecycleAction(target(), {
    type: "choose_backup",
    selectedOn: "2027-08-10",
    title: "   ",
    note: "",
  }), /Backup choice is required/);

  const backup = applyBookingLifecycleAction(target(), {
    type: "choose_backup",
    selectedOn: "2027-08-10",
    title: "  Alternate character meal  ",
    note: "Family choice, availability not checked",
  });
  assert.equal(backup.status, "backup");
  assert.deepEqual(backup.fallbackChoice, {
    title: "Alternate character meal",
    selectedOn: "2027-08-10",
    note: "Family choice, availability not checked",
  });
  assert.equal(backup.linkedReservationId, null);
});

test("booked state requires a deliberate link to an existing reservation", () => {
  const action = {
    type: "link_booked",
    attemptId: "attempt-booked",
    attemptedOn: "2027-08-10",
    note: "Confirmation received",
    reservationId: "missing",
  };
  assert.throws(() => applyBookingLifecycleAction(target(), action, reservations), /existing reservation/);

  const booked = applyBookingLifecycleAction(target(), { ...action, reservationId: "reservation-bbb" }, reservations);
  assert.equal(booked.status, "booked");
  assert.equal(booked.linkedReservationId, "reservation-bbb");
  assert.deepEqual(booked.attempts, [{
    id: "attempt-booked",
    attemptedOn: "2027-08-10",
    result: "booked",
    note: "Confirmation received",
    reservationId: "reservation-bbb",
  }]);
  assert.equal(summarizeBookingLifecycle(booked, reservations).linkedReservationTitle, "Bibbidi Bobbidi Boutique");

  assert.throws(() => applyBookingLifecycleAction(booked, {
    type: "mark_unavailable",
    attemptId: "after-booked",
    attemptedOn: "2027-08-11",
    note: "",
  }, reservations), /Unlink the booked reservation/);

  const unlinked = applyBookingLifecycleAction(booked, { type: "unlink_booking" }, reservations);
  assert.equal(unlinked.status, "attempted");
  assert.equal(unlinked.linkedReservationId, null);
  assert.deepEqual(unlinked.attempts, booked.attempts);
});

test("broken or inconsistent reservation links are warned about but never cleaned", () => {
  assert.match(summarizeBookingLifecycle(target({ status: "booked" }), reservations).warning, /needs a deliberate reservation link/);
  const missing = target({ status: "booked", linkedReservationId: "deleted-reservation" });
  assert.match(summarizeBookingLifecycle(missing, reservations).warning, /no longer available/);
  assert.equal(missing.linkedReservationId, "deleted-reservation");
  assert.match(summarizeBookingLifecycle(target({ status: "planned", linkedReservationId: "reservation-bbb" }), reservations).warning, /outside the booked state/);
});

test("Phase 2C planner has explicit lifecycle controls but no reservation or itinerary writer", async () => {
  const source = await readFile(new URL("../app/components/BookingTargetPlanner.tsx", import.meta.url), "utf8");
  assert.match(source, /Record attempt/);
  assert.match(source, /Record unavailable result/);
  assert.match(source, /Select this backup/);
  assert.match(source, /Link reservation &amp; mark booked/);
  assert.match(source, /loadRawReservations/);
  assert.doesNotMatch(source, /saveReservations|newReservation|saveTripProfile|saveResortPlan|saveTripWeekApproval/);
  assert.match(source, /does not claim live availability/);
  assert.match(source, /only points to a reservation you already created deliberately/);
});
