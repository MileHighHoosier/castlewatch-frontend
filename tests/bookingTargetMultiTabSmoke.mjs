import assert from "node:assert/strict";

const KEY = "castlewatch.booking-targets.v1";
const LOCK = KEY + ".write";
const initial = [
  {
    id: "multi-tab-A", title: "Multi-tab fixture", targetType: "other", priority: "standard",
    desiredTripDate: "", status: "planned", linkedReservationId: null, notes: "",
    bookingRule: { provenance: { source: "Original source", sourceUrl: null, asOfDate: null, future: "keep" }, verification: "needs_verification", openingDaysBeforeTrip: null, deadlineDaysBeforeTrip: null },
    manualOverride: { openingDate: "2099-08-10", deadlineDate: null, note: "Family fixture", future: "keep" },
    future: { retained: true },
  },
  {
    id: "multi-tab-untouched", title: "Untouched fixture", targetType: "other", priority: "low",
    desiredTripDate: "", status: "planned", linkedReservationId: null, notes: "Keep this",
    bookingRule: null, manualOverride: null, future: { retained: "untouched" },
  },
];

async function evaluate(page, fn, ...args) {
  const result = await page.send("Runtime.evaluate", {
    expression: `(${fn.toString()})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}

async function waitFor(page, predicate, label, ...args) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(page, predicate, ...args)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Multi-tab smoke timed out: " + label);
}

async function seed(first, second) {
  await evaluate(first, async (key, lock, rows) => {
    await navigator.locks.request(lock, { mode: "exclusive" }, () => localStorage.setItem(key, JSON.stringify(rows)));
    window.dispatchEvent(new Event("focus"));
  }, KEY, LOCK, initial);
  for (const page of [first, second]) {
    await waitFor(page, () => {
      const card = document.querySelector('[data-target-id="multi-tab-A"]');
      return document.querySelectorAll(".booking-target-card").length === 2
        && document.querySelector('[data-target-id="multi-tab-untouched"]')
        && card?.querySelector("textarea")?.value === ""
        && card.textContent.includes("Original source")
        && card.textContent.includes("Family fixture")
        && document.querySelector('.booking-planner[aria-busy="false"]')
        && !document.querySelector('.booking-planner [role="alert"]');
    }, "fixture loaded in both tabs");
  }
}

async function hold(page) {
  await evaluate(page, (lock) => new Promise((acquired) => {
    window.__cwSmokeLock = navigator.locks.request(lock, { mode: "exclusive" }, () => new Promise((release) => {
      window.__cwSmokeRelease = release;
      acquired(true);
    }));
  }), LOCK);
}

async function release(page) {
  await evaluate(page, async () => {
    window.__cwSmokeRelease();
    await window.__cwSmokeLock;
    delete window.__cwSmokeRelease;
    delete window.__cwSmokeLock;
  });
}

async function action(page, operation) {
  await evaluate(page, (op) => {
    if (op === "add" || op === "otherAdd") {
      const label = op === "add" ? "+ Custom target" : "+ Cinderella's Royal Table";
      const button = [...document.querySelectorAll(".booking-planner-add button")].find((node) => node.textContent === label);
      if (!button || button.disabled) throw new Error("Missing enabled quick-add " + label);
      button.click();
      return;
    }
    const card = document.querySelector('[data-target-id="multi-tab-A"]');
    if (!card) throw new Error("Multi-tab target is missing");
    if (op === "recordAttempt") {
      const workflow = card.querySelector(".booking-lifecycle");
      if (!workflow.open) workflow.querySelector("summary").click();
      const button = [...workflow.querySelectorAll("button")].find((node) => node.textContent === "Record attempt");
      if (!button) throw new Error("Missing planner lifecycle attempt action");
      button.click();
      return;
    }
    const editor = card.querySelector(".booking-target-editor");
    if (!editor.open) editor.querySelector("summary").click();
    if (op === "edit") {
      const row = [...card.querySelectorAll("label")].find((node) => node.querySelector("span")?.textContent === "Planning notes");
      const input = row.querySelector("textarea");
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value").set;
      setter.call(input, "Captured queued edit");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      // Mutate the element after the React event without another input event.
      // A queued mutation must use the captured text, not this later DOM value.
      setter.call(input, "Must not persist");
      return;
    }
    const label = { clearRule: "Clear rule", clearOverrides: "Clear overrides", remove: "Remove planning target" }[op];
    const button = [...card.querySelectorAll("button")].find((node) => node.textContent === label);
    if (!button) throw new Error("Missing planner action " + op);
    button.click();
  }, operation);
}

async function pending(page, count) {
  await waitFor(page, async (lock, expected) => {
    const state = await navigator.locks.query();
    return state.pending.filter((item) => item.name === lock).length === expected;
  }, "both planner actions queued behind real browser lock", LOCK, count);
}

export async function plannerWritesSettled(lock, locks = navigator.locks, root = document) {
  const state = await locks.query();
  const lockQueueIdle = [...state.held, ...state.pending].every((item) => item.name !== lock);
  return lockQueueIdle && Boolean(root.querySelector('.booking-planner[aria-busy="false"]'));
}

async function settled(page) {
  await waitFor(page, plannerWritesSettled, "planner lock queue drained and rendering finished", LOCK);
}

export async function verifyBookingTargetMultiTab(first, second) {
  await waitFor(second, () => document.readyState === "complete" && [...document.querySelectorAll(".top-park-button")].some((node) => node.textContent.includes("Booking Planner")), "second tab hydrated");
  await evaluate(second, () => [...document.querySelectorAll(".top-park-button")].find((node) => node.textContent.includes("Booking Planner")).click());
  await waitFor(second, () => Boolean(document.querySelector(".booking-planner")), "second planner rendered");
  await settled(first);

  for (const op of ["add", "edit", "clearRule", "clearOverrides", "recordAttempt", "remove"]) {
    for (const reverse of [false, true]) {
      await seed(first, second);
      await hold(first);
      try {
        await action(reverse ? second : first, reverse ? "otherAdd" : op);
        await pending(first, 1);
        await action(reverse ? first : second, reverse ? op : "otherAdd");
        await pending(first, 2);
        assert.deepEqual(await evaluate(first, (key) => JSON.parse(localStorage.getItem(key)), KEY), initial, "queued edits must not write before acquiring the lock");
      } finally {
        await release(first);
      }
      await settled(first);
      await settled(second);
      const rows = await evaluate(first, (key) => JSON.parse(localStorage.getItem(key)), KEY);
      assert.deepEqual(rows.find((row) => row.id === initial[1].id), initial[1]);
      assert.equal(rows.filter((row) => row.title === "Cinderella's Royal Table").length, 1, op + " preserves the other tab's addition");
      const edited = rows.find((row) => row.id === initial[0].id);
      if (op === "remove") assert.equal(edited, undefined);
      else {
        assert.deepEqual(edited.future, initial[0].future);
        if (op === "edit") assert.equal(edited.notes, "Captured queued edit");
        if (op === "clearRule") assert.equal(edited.bookingRule, null);
        if (op === "clearOverrides") assert.equal(edited.manualOverride, null);
        if (op === "recordAttempt") {
          assert.equal(edited.status, "attempted");
          assert.equal(edited.attempts.length, 1);
          assert.equal(edited.attempts[0].result, "attempted");
        }
      }
      if (op === "add") assert.equal(rows.filter((row) => row.title === "New booking target").length, 1);
      for (const page of [first, second]) {
        await waitFor(page, (ids) => JSON.stringify([...document.querySelectorAll(".booking-target-card")].map((card) => card.dataset.targetId).sort()) === JSON.stringify(ids), "both rendered collections converge", rows.map((row) => row.id).sort());
        assert.equal(await evaluate(page, () => Boolean(document.querySelector('.booking-planner [role="alert"]'))), false);
      }
    }
  }

  for (const raw of [JSON.stringify({ futureShape: 2 }), "{broken-json", JSON.stringify([{ ...initial[0], desiredTripDate: "2027-02-29" }])]) {
    await seed(first, second);
    await hold(first);
    try {
      await action(first, "edit");
      await action(second, "otherAdd");
      await pending(first, 2);
      // Simulate a raw replacement/corruption under the same lock while both
      // planner actions wait. Neither may turn it into a lossy valid collection.
      await evaluate(first, (key, value) => localStorage.setItem(key, value), KEY, raw);
    } finally {
      await release(first);
    }
    for (const page of [first, second]) {
      await settled(page);
      await waitFor(page, () => Boolean(document.querySelector('.booking-planner [role="alert"]')), "malformed-data warning");
      assert.equal(await evaluate(page, (key) => localStorage.getItem(key), KEY), raw);
      assert.equal(await evaluate(page, () => document.querySelectorAll(".booking-target-card").length), 0, "failed optimistic edits roll back");
    }
    // Remount to clear the failed-save notice before the next isolated fixture.
    await evaluate(first, (key, rows) => localStorage.setItem(key, JSON.stringify(rows)), KEY, initial);
    for (const page of [first, second]) {
      await evaluate(page, () => [...document.querySelectorAll(".top-park-button")].find((node) => node.textContent.includes("Trip Week")).click());
      await waitFor(page, () => !document.querySelector(".booking-planner"), "leave failed planner");
      await evaluate(page, () => [...document.querySelectorAll(".top-park-button")].find((node) => node.textContent.includes("Booking Planner")).click());
      await waitFor(page, () => Boolean(document.querySelector(".booking-planner")), "remount planner");
    }
  }
  console.log("CastleWatch rendered multi-tab planner smoke passed: 12 ordered action pairs; 3 malformed/future-storage interleavings");
}
