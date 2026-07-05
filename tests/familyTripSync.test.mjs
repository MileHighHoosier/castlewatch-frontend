import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeFamilyTripSync,
  fingerprintFamilyTripPayload,
} from "../app/lib/familyTripSync.ts";

function payload(name = "Base plan", reservations = []) {
  return {
    schemaVersion: 1,
    tripProfile: {
      tripName: name,
      startDate: "2027-10-09",
      endDate: "2027-10-16",
      adults: 2,
      children: 2,
      childAges: "",
      status: "provisional",
      noParkHopping: true,
      notes: "",
    },
    reservations,
    resortPlan: { "2027-10-09": "value_tbd" },
    approval: {
      activeScenario: "base",
      previousScenario: null,
      locked: false,
      lockedAt: null,
      updatedAt: "",
    },
  };
}

function remote(version, value) {
  return {
    status: version ? "ok" : "empty",
    version,
    payload: value,
    updatedAt: null,
  };
}

function metadata(version, value) {
  return {
    version,
    baselineFingerprint: fingerprintFamilyTripPayload(value),
    baselinePayload: value,
    syncedAt: "2026-07-05T12:00:00.000Z",
  };
}

test("fingerprints are stable when object keys arrive in a different order", () => {
  const first = payload();
  const second = {
    approval: {
      updatedAt: "",
      lockedAt: null,
      locked: false,
      previousScenario: null,
      activeScenario: "base",
    },
    resortPlan: { "2027-10-09": "value_tbd" },
    reservations: [],
    tripProfile: {
      notes: "",
      noParkHopping: true,
      status: "provisional",
      childAges: "",
      children: 2,
      adults: 2,
      endDate: "2027-10-16",
      startDate: "2027-10-09",
      tripName: "Base plan",
    },
    schemaVersion: 1,
  };

  assert.equal(
    fingerprintFamilyTripPayload(first),
    fingerprintFamilyTripPayload(second),
  );
});

test("first upload is allowed only when the shared plan is empty", () => {
  const analysis = analyzeFamilyTripSync(payload(), remote(0, null), null);

  assert.equal(analysis.id, "remote_empty");
  assert.equal(analysis.canUpload, true);
  assert.equal(analysis.canDownload, false);
});

test("matching copies establish an up-to-date baseline without replacing data", () => {
  const value = payload();
  const analysis = analyzeFamilyTripSync(value, remote(4, value), null);

  assert.equal(analysis.id, "up_to_date");
  assert.equal(analysis.canUpload, false);
  assert.equal(analysis.canDownload, false);
});

test("different copies with no prior baseline require a deliberate choice", () => {
  const analysis = analyzeFamilyTripSync(
    payload("Local"),
    remote(4, payload("Shared")),
    null,
  );

  assert.equal(analysis.id, "baseline_required");
  assert.equal(analysis.canUpload, true);
  assert.equal(analysis.canDownload, true);
});

test("offline local edits remain local and are surfaced for review", () => {
  const base = payload();
  const local = payload("Edited offline");
  const analysis = analyzeFamilyTripSync(local, remote(4, base), metadata(4, base));

  assert.equal(analysis.id, "local_changes");
  assert.equal(analysis.localChanged, true);
  assert.equal(analysis.remoteChanged, false);
  assert.equal(analysis.canUpload, true);
});

test("a newer shared version blocks uploading until it is downloaded", () => {
  const base = payload();
  const shared = payload("Changed on the other device");
  const analysis = analyzeFamilyTripSync(base, remote(5, shared), metadata(4, base));

  assert.equal(analysis.id, "remote_changes");
  assert.equal(analysis.canUpload, false);
  assert.equal(analysis.canDownload, true);
});

test("downloading the newer shared copy returns the browser to up to date", () => {
  const shared = payload("Changed on the other device");
  const analysis = analyzeFamilyTripSync(shared, remote(5, shared), metadata(5, shared));

  assert.equal(analysis.id, "up_to_date");
});

test("simultaneous edits create a conflict and never permit upload", () => {
  const base = payload();
  const local = payload("Local edit");
  const shared = payload("Remote edit");
  const analysis = analyzeFamilyTripSync(local, remote(5, shared), metadata(4, base));

  assert.equal(analysis.id, "conflict");
  assert.equal(analysis.localChanged, true);
  assert.equal(analysis.remoteChanged, true);
  assert.equal(analysis.canUpload, false);
  assert.equal(analysis.canDownload, true);
});
