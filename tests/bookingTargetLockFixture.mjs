import assert from "node:assert/strict";

// FIFO lock service shared by the simulated tabs. The rendered smoke uses the
// browser's real LockManager; this fixture makes critical-section ordering exact.
export function lockManager() {
  const tails = new Map();
  return {
    request(name, options, callback) {
      assert.equal(options.mode, "exclusive");
      const previous = tails.get(name) || Promise.resolve();
      const result = previous.then(() => callback({ name, mode: "exclusive" }));
      tails.set(name, result.catch(() => {}));
      return result;
    },
  };
}
