import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateBookingWindow } from "../app/lib/bookingTargets.ts";
import { bookingWindowReadiness, buildBookingTimeline } from "../app/lib/bookingTargetTimeline.ts";

function target(patch = {}) {
  return {
    id: "bbb-2027",
    title: "Bibbidi Bobbidi Boutique",
    targetType: "experience",
    priority: "must_do",
    desiredTripDate: "2027-10-09",
    status: "planned",
    bookingRule: {
      provenance: { source: "Verified fixture", sourceUrl: null, asOfDate: "2026-09-09" },
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

test("prioritized timeline sorts priority first, then effective opening date and title", () => {
  const rows = buildBookingTimeline([
    target({ id: "low", title: "Low", priority: "low" }),
    target({ id: "high-later", title: "Later", priority: "high", desiredTripDate: "2027-10-12" }),
    target({ id: "high-earlier-b", title: "Beta", priority: "high" }),
    target({ id: "high-earlier-a", title: "Alpha", priority: "high" }),
    target({ id: "must", title: "Must", priority: "must_do" }),
  ], "2027-01-01");
  assert.deepEqual(rows.map((row) => row.target.id), ["must", "high-earlier-a", "high-earlier-b", "high-later", "low"]);
});

test("readiness uses inclusive opening and deadline calendar-day boundaries", () => {
  const window = calculateBookingWindow(target());
  assert.equal(bookingWindowReadiness(window, "2027-08-09").id, "upcoming");
  assert.equal(bookingWindowReadiness(window, "2027-08-10").id, "opens_today");
  assert.equal(bookingWindowReadiness(window, "2027-08-11").id, "open");
  assert.equal(bookingWindowReadiness(window, "2027-10-08").id, "deadline_today");
  assert.equal(bookingWindowReadiness(window, "2027-10-09").id, "past_deadline");
});

test("unverified, unavailable and inconsistent rules stay neutral and explicit", () => {
  const unverified = calculateBookingWindow(target({
    bookingRule: { ...target().bookingRule, verification: "needs_verification" },
  }));
  assert.equal(bookingWindowReadiness(unverified, "2027-08-01").id, "needs_verification");

  const unavailable = calculateBookingWindow(target({ bookingRule: null }));
  assert.equal(bookingWindowReadiness(unavailable, "2027-08-01").id, "not_scheduled");

  const inconsistent = calculateBookingWindow(target({
    bookingRule: { ...target().bookingRule, openingDaysBeforeTrip: 1, deadlineDaysBeforeTrip: 60 },
  }));
  assert.equal(bookingWindowReadiness(inconsistent, "2027-08-01").id, "invalid");

  const missingProvenance = calculateBookingWindow(target({
    bookingRule: {
      ...target().bookingRule,
      provenance: { source: "", sourceUrl: null, asOfDate: null },
    },
  }));
  assert.equal(bookingWindowReadiness(missingProvenance, "2027-08-01").label, "Verify source");
});

test("a newly quick-added target stays neutral until planning inputs are added", () => {
  const window = calculateBookingWindow(target({
    desiredTripDate: "",
    bookingRule: null,
  }));
  assert.deepEqual(bookingWindowReadiness(window, "2027-08-01"), {
    id: "not_scheduled",
    label: "Date needed",
    detail: "Add a verified rule and desired trip date, or a clearly labeled manual opening date.",
    tone: "neutral",
  });
});

test("a manual opening date remains valid when the optional deadline and trip date are absent", () => {
  const window = calculateBookingWindow(target({
    desiredTripDate: "",
    bookingRule: null,
    manualOverride: {
      openingDate: "2027-08-10",
      deadlineDate: null,
      note: "Family-selected call date",
    },
  }));
  assert.equal(window.deadline.status, "invalid");
  assert.deepEqual(bookingWindowReadiness(window, "2027-08-01"), {
    id: "upcoming",
    label: "Opens in 9 days",
    detail: "Opening date: 2027-08-10.",
    tone: "upcoming",
  });
});

test("manual opening dates drive ordering without claiming an official rule", () => {
  const rows = buildBookingTimeline([
    target({ id: "calculated", priority: "standard" }),
    target({
      id: "manual",
      priority: "standard",
      bookingRule: null,
      manualOverride: { openingDate: "2027-07-01", deadlineDate: null, note: "Family-selected call date" },
    }),
  ], "2027-01-01");
  assert.equal(rows[0].target.id, "manual");
  assert.equal(rows[0].window.opening.source, "manual_override");
});

test("inconsistent family overrides are shown as invalid", () => {
  const window = calculateBookingWindow(target({
    bookingRule: null,
    manualOverride: { openingDate: "2027-09-01", deadlineDate: "2027-08-31", note: "Needs review" },
  }));
  const readiness = bookingWindowReadiness(window, "2027-08-01");
  assert.equal(readiness.id, "invalid");
  assert.match(readiness.detail, /opening date is after the deadline/i);
});

test("Phase 2B planner stays declarative and does not mutate reservation or itinerary controls", async () => {
  const source = await readFile(new URL("../app/components/BookingTargetPlanner.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|\.innerHTML\s*=/);
  assert.doesNotMatch(source, /saveReservations|saveTripProfile|saveResortPlan|saveTripWeekApproval/);
  assert.doesNotMatch(source, /updateTarget\([^)]*,\s*\{\s*status:/);
  assert.match(source, /Targets never create or change reservations or your itinerary/);
  assert.match(source, /does not assume an official booking policy/);
});
