import test from "node:test";
import assert from "node:assert/strict";
import {
  activeLightningLaneConflict,
  isValidLightningLane,
  lightningLaneConflictNote,
  lightningLaneStatus,
  nextLightningLaneHint,
  parseLightningLanes,
  sortLightningLanesByUrgency,
} from "../app/lib/lightningLane.ts";

const NOW = new Date(2027, 9, 10, 10, 0, 0, 0);

function lane(overrides = {}) {
  return {
    id: "guardians",
    name: "Guardians",
    start: "10:30",
    end: "11:30",
    used: false,
    ...overrides,
  };
}

test("malformed persisted Lightning Lane state degrades to an empty tracker", () => {
  assert.deepEqual(parseLightningLanes("not-json"), []);
  assert.deepEqual(parseLightningLanes('{"id":"not-an-array"}'), []);
  assert.deepEqual(parseLightningLanes(JSON.stringify([
    lane({ name: "  Guardians  " }),
    lane({ id: "reverse", start: "12:00", end: "11:00" }),
    { id: "missing-fields" },
  ])), [lane()]);
});

test("new windows require a ride, valid clock values and an end after the start", () => {
  assert.equal(isValidLightningLane(lane()), true);
  assert.equal(isValidLightningLane(lane({ name: " " })), false);
  assert.equal(isValidLightningLane(lane({ start: "25:00" })), false);
  assert.equal(isValidLightningLane(lane({ end: "10:30" })), false);
  assert.equal(isValidLightningLane(lane({ start: "12:00", end: "11:00" })), false);
});

test("status distinguishes used, expired, active, soon and later windows", () => {
  assert.equal(lightningLaneStatus(lane({ used: true }), NOW), "Used");
  assert.equal(lightningLaneStatus(lane({ start: "08:00", end: "09:00" }), NOW), "Expired");
  assert.equal(lightningLaneStatus(lane({ start: "09:30", end: "10:30" }), NOW), "Use now");
  assert.equal(lightningLaneStatus(lane({ start: "10:30", end: "11:30" }), NOW), "Soon · 30m");
  assert.equal(lightningLaneStatus(lane({ start: "11:00", end: "12:00" }), NOW), "Later · 60m");
});

test("Plan conflict guidance includes active or next-hour windows and ignores spent ones", () => {
  const used = lane({ id: "used", name: "Used ride", start: "09:30", end: "10:30", used: true });
  const expired = lane({ id: "expired", name: "Expired ride", start: "08:00", end: "09:00" });
  const soon = lane({ id: "soon", name: "Flight of Passage", start: "11:00", end: "12:00" });
  const conflict = activeLightningLaneConflict([used, expired, soon], NOW);

  assert.equal(conflict?.lane.id, "soon");
  assert.equal(conflict?.untilStart, 60);
  assert.match(lightningLaneConflictNote([used, expired, soon], NOW), /starts in 60m/);
  assert.equal(
    lightningLaneConflictNote([lane({ start: "11:01", end: "12:01" })], NOW),
    "",
  );
});

test("an active window takes precedence and prompts the next selection after tap-in", () => {
  const active = lane({ id: "active", name: "Slinky Dog", start: "09:45", end: "10:45" });
  const soon = lane({ id: "soon", name: "Tower of Terror", start: "10:20", end: "11:20" });
  assert.equal(activeLightningLaneConflict([soon, active], NOW)?.lane.id, "active");
  assert.match(lightningLaneConflictNote([soon, active], NOW), /Lightning Lane active: Slinky Dog/);
  assert.equal(
    nextLightningLaneHint([soon, active], NOW),
    "After tapping into Slinky Dog, check for another selection.",
  );
});

test("urgency ordering keeps actionable windows ahead of expired and used entries", () => {
  const lanes = [
    lane({ id: "used", start: "09:00", end: "10:00", used: true }),
    lane({ id: "future", start: "10:45", end: "11:45" }),
    lane({ id: "expired", start: "08:00", end: "09:00" }),
    lane({ id: "active-later", start: "09:30", end: "10:50" }),
    lane({ id: "active-sooner", start: "09:45", end: "10:20" }),
  ];
  assert.deepEqual(
    sortLightningLanesByUrgency(lanes, NOW).map((item) => item.id),
    ["active-sooner", "active-later", "future", "expired", "used"],
  );
});

test("the next-window hint names the earliest valid future booking", () => {
  assert.equal(
    nextLightningLaneHint([
      lane({ id: "later", name: "Guardians", start: "12:00", end: "13:00" }),
      lane({ id: "next", name: "Frozen", start: "10:45", end: "11:45" }),
    ], NOW),
    "Next window to watch: Frozen at 10:45 AM.",
  );
  assert.match(nextLightningLaneHint([], NOW), /No active Lightning Lane windows/);
});
