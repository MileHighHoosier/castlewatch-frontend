import test from "node:test";
import assert from "node:assert/strict";
import { plannerWritesSettled } from "./bookingTargetMultiTabSmoke.mjs";

const LOCK = "castlewatch.booking-targets.v1.write";
const idlePlanner = { querySelector: () => ({}) };

function locks(state) {
  return { query: async () => state };
}

test("rendered multi-tab smoke waits for held and pending planner writes", async () => {
  assert.equal(await plannerWritesSettled(LOCK, locks({
    held: [{ name: LOCK, mode: "exclusive" }],
    pending: [],
  }), idlePlanner), false);

  assert.equal(await plannerWritesSettled(LOCK, locks({
    held: [],
    pending: [{ name: LOCK, mode: "exclusive" }],
  }), idlePlanner), false);

  assert.equal(await plannerWritesSettled(LOCK, locks({ held: [], pending: [] }), idlePlanner), true);
  assert.equal(await plannerWritesSettled(LOCK, locks({ held: [], pending: [] }), { querySelector: () => null }), false);
});
