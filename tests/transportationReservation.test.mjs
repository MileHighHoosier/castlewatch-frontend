import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TRIP_PROFILE,
  buildReservationWarnings,
  reservationPlan,
} from "../app/lib/tripProfile.ts";
import { DEFAULT_RESORT_PLAN } from "../app/lib/tripResorts.ts";
import {
  getResortTransferRoute,
  getResortTransportationRoute,
  projectTransportationArrival,
  transportationRouteRisk,
  transportationLeaveBy,
} from "../app/lib/transportationPlanning.ts";

function reservation(overrides = {}) {
  return {
    id: "booking",
    type: "experience",
    title: "Bibbidi Bobbidi Boutique",
    date: "2027-10-10",
    time: "09:00",
    location: "Magic Kingdom",
    status: "confirmed",
    durationMinutes: 90,
    arrivalBufferMinutes: 30,
    notes: "",
    ...overrides,
  };
}

test("the production trip and split-stay defaults preserve the approved family plan", () => {
  assert.deepEqual(
    {
      startDate: DEFAULT_TRIP_PROFILE.startDate,
      endDate: DEFAULT_TRIP_PROFILE.endDate,
      adults: DEFAULT_TRIP_PROFILE.adults,
      children: DEFAULT_TRIP_PROFILE.children,
      noParkHopping: DEFAULT_TRIP_PROFILE.noParkHopping,
    },
    {
      startDate: "2027-10-09",
      endDate: "2027-10-16",
      adults: 2,
      children: 2,
      noParkHopping: true,
    },
  );
  assert.deepEqual(DEFAULT_RESORT_PLAN, {
    "2027-10-09": "value_tbd",
    "2027-10-10": "value_tbd",
    "2027-10-11": "value_tbd",
    "2027-10-12": "beach",
    "2027-10-13": "beach",
    "2027-10-14": "beach",
    "2027-10-15": "akl_jambo",
  });
});

test("reservation leave-by guidance uses the correct overnight resort", () => {
  const boutique = reservationPlan(reservation(), DEFAULT_RESORT_PLAN);
  assert.deepEqual(boutique, {
    origin: "Value Resort",
    route: "Disney bus labeled Magic Kingdom",
    travelMinutes: 55,
    requiredArrival: "8:30 AM",
    leaveBy: "7:35 AM",
  });

  const akershus = reservationPlan(reservation({
    id: "akershus",
    type: "dining",
    title: "Akershus Royal Banquet Hall",
    date: "2027-10-13",
    time: "12:00",
    location: "Epcot",
    arrivalBufferMinutes: 20,
  }), DEFAULT_RESORT_PLAN);
  assert.deepEqual(akershus, {
    origin: "Beach Club",
    route: "Walk to Epcot International Gateway",
    travelMinutes: 25,
    requiredArrival: "11:40 AM",
    leaveBy: "11:15 AM",
  });
});

test("afternoon dining and departure guidance use the same-day and final-night resorts", () => {
  const parkFare = reservationPlan(reservation({
    id: "park-fare",
    type: "dining",
    title: "1900 Park Fare",
    date: "2027-10-12",
    time: "17:30",
    location: "Grand Floridian",
    arrivalBufferMinutes: 20,
  }), DEFAULT_RESORT_PLAN);
  assert.equal(parkFare.origin, "Beach Club");
  assert.equal(parkFare.requiredArrival, "5:10 PM");
  assert.equal(parkFare.leaveBy, "3:45 PM");

  const departure = reservationPlan(reservation({
    id: "departure",
    type: "flight",
    title: "Departure Flight",
    date: "2027-10-16",
    time: "10:00",
    location: "MCO Departure",
    arrivalBufferMinutes: 180,
  }), DEFAULT_RESORT_PLAN);
  assert.equal(departure.origin, "AKL Jambo House");
  assert.equal(departure.requiredArrival, "7:00 AM");
  assert.equal(departure.leaveBy, "5:45 AM");
});

test("Getting There, reservations and Trip Week share one assignable route model", () => {
  const popToEpcot = getResortTransportationRoute("pop", "Epcot");
  assert.deepEqual(
    {
      assignable: popToEpcot.assignable,
      mode: popToEpcot.mode,
      travelMin: popToEpcot.travelMin,
      travelMax: popToEpcot.travelMax,
      walkToStop: popToEpcot.walkToStop,
      arrivalBuffer: popToEpcot.arrivalBuffer,
      risk: transportationRouteRisk(popToEpcot),
    },
    {
      assignable: true,
      mode: "Disney Skyliner to Epcot",
      travelMin: 20,
      travelMax: 40,
      walkToStop: 10,
      arrivalBuffer: 15,
      risk: 2,
    },
  );

  const beachToEpcot = getResortTransportationRoute("beach", "Epcot");
  assert.equal(beachToEpcot.mode, "Walk to Epcot International Gateway");
  assert.equal(beachToEpcot.walkToStop + beachToEpcot.travelMax, 25);
  assert.equal(transportationRouteRisk(beachToEpcot), 0);
});

test("unknown resort routes stay unassignable and neutral", () => {
  const route = getResortTransportationRoute("missing-resort", "Magic Kingdom");
  assert.equal(route.assignable, false);
  assert.equal(route.origin, "Unassigned resort");
  assert.equal(route.travelMax, 0);
  assert.equal(transportationRouteRisk(route), 0);

  const guidance = reservationPlan(
    reservation(),
    { ...DEFAULT_RESORT_PLAN, "2027-10-09": "missing-resort" },
  );
  assert.equal(guidance.origin, "Unassigned resort");
  assert.equal(guidance.travelMinutes, 0);
  assert.equal(guidance.leaveBy, "8:30 AM");
});

test("resort transfers use the shared conservative transfer timing", () => {
  const aklTransfer = getResortTransferRoute("beach", "akl_jambo");
  assert.deepEqual(
    {
      assignable: aklTransfer.assignable,
      mode: aklTransfer.mode,
      travelMin: aklTransfer.travelMin,
      travelMax: aklTransfer.travelMax,
      walkToStop: aklTransfer.walkToStop,
    },
    {
      assignable: true,
      mode: "Bus to Animal Kingdom, then bus to the selected AKL building",
      travelMin: 45,
      travelMax: 75,
      walkToStop: 10,
    },
  );
  assert.equal(getResortTransferRoute("beach", "beach").travelMax, 0);
  assert.equal(getResortTransferRoute("missing", "beach").assignable, false);
});

test("Getting There leave-by and bus projections use the conservative route allowance", () => {
  const timing = { walkToStop: 10, travelMin: 20, travelMax: 45, arrivalBuffer: 15 };
  assert.equal(transportationLeaveBy("08:00", timing), "6:50 AM");
  assert.equal(transportationLeaveBy("", timing), "Time needed");
  assert.deepEqual(projectTransportationArrival("07:00", "08:00", timing), {
    range: "7:35 AM–8:00 AM",
    onTime: true,
  });
  assert.deepEqual(projectTransportationArrival("07:05", "08:00", timing), {
    range: "7:40 AM–8:05 AM",
    onTime: false,
  });
});

test("park-assignment conflicts retain the no-park-hopping severity", () => {
  const booking = reservation({ location: "Epcot" });
  const assigned = { "2027-10-10": "Magic Kingdom" };

  assert.equal(buildReservationWarnings([booking], assigned, true)[0]?.level, "conflict");
  assert.equal(buildReservationWarnings([booking], assigned, false)[0]?.level, "warning");
});

test("same-day cross-park, overlap and transfer risks remain distinguishable", () => {
  const first = reservation({
    id: "first",
    title: "Cinderella's Royal Table",
    time: "10:00",
    durationMinutes: 60,
    arrivalBufferMinutes: 20,
  });
  const overlapping = reservation({
    id: "overlap",
    title: "Bibbidi Bobbidi Boutique",
    time: "11:00",
    durationMinutes: 90,
    arrivalBufferMinutes: 20,
  });
  const acrossParks = reservation({
    id: "across-parks",
    title: "Akershus Royal Banquet Hall",
    time: "13:00",
    location: "Epcot",
    durationMinutes: 90,
    arrivalBufferMinutes: 20,
  });

  const warnings = buildReservationWarnings([first, overlapping, acrossParks], {}, true);
  assert.ok(warnings.some((warning) => (
    warning.level === "conflict" && warning.message.includes("multiple parks")
  )));
  assert.ok(warnings.some((warning) => (
    warning.reservationId === "overlap"
      && warning.level === "conflict"
      && warning.message.includes("overlaps")
  )));
  assert.ok(warnings.some((warning) => (
    warning.reservationId === "across-parks"
      && warning.level === "warning"
      && warning.message.includes("allow about 75 minutes")
  )));
});

test("a transfer with exactly the required allowance does not raise a warning", () => {
  const first = reservation({ id: "first", time: "10:00", durationMinutes: 60 });
  const second = reservation({
    id: "second",
    title: "Second Magic Kingdom booking",
    time: "11:40",
    arrivalBufferMinutes: 20,
  });
  assert.deepEqual(buildReservationWarnings([first, second], {}, true), []);
});
