import test from "node:test";
import assert from "node:assert/strict";
import { plannerWritesSettled, waitForPlannerStorageConvergence } from "./bookingTargetMultiTabSmoke.mjs";

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

test("rendered multi-tab smoke waits for both renderer-local storage views", async () => {
  const current = JSON.stringify([{ id: "current" }, { id: "other-tab" }]);
  let reads = 0;
  let pauses = 0;
  const rows = await waitForPlannerStorageConvergence(async () => {
    reads += 1;
    return reads === 1
      ? [JSON.stringify([{ id: "current" }]), current]
      : [current, current];
  }, async () => {
    pauses += 1;
  }, 2);

  assert.equal(reads, 2);
  assert.equal(pauses, 1);
  assert.deepEqual(rows, [{ id: "current" }, { id: "other-tab" }]);
});

test("rendered multi-tab smoke rejects matching missing storage", async () => {
  await assert.rejects(
    waitForPlannerStorageConvergence(async () => [null, null], async () => {}, 1),
    /both tabs observe the same stored planner collection/,
  );
});
