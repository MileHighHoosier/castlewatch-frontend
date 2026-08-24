import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeFamilyTripSync,
  FamilyTripSyncError,
  fetchFamilyTrip,
  fetchFamilyTripHistory,
  fetchFamilyTripHistoryVersion,
  fingerprintFamilyTripPayload,
  restoreFamilyTripVersion,
  saveFamilyTrip,
} from "../app/lib/familyTripSync.ts";
import {
  FAMILY_AUTHORIZATION_MODE_STORAGE_KEY,
  FAMILY_KEY_STORAGE_KEY,
} from "../app/lib/familyTripAuthorization.ts";
import { FAMILY_DEVICE_ACCESS_STORAGE_KEY } from "../app/lib/familyTripDevices.ts";

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

test("all shared-plan clients send one explicit family-key authorization", async () => {
  const originalFetch = globalThis.fetch;
  const captured = [];
  const value = payload();
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    captured.push({ body, credentials: options.credentials });
    if (body.action === "history") {
      return new Response(JSON.stringify({ status: "ok", currentVersion: 3, entries: [] }), { status: 200 });
    }
    if (body.action === "history_version") {
      return new Response(JSON.stringify({ status: "ok", version: body.version, payload: value, summary: {} }), { status: 200 });
    }
    return new Response(JSON.stringify({ status: "ok", version: 3, payload: value }), { status: 200 });
  };
  const authorization = {
    mode: "family_key",
    key: "  family-key  ",
    role: "owner",
    label: "Family key",
  };

  try {
    await fetchFamilyTrip(authorization);
    await saveFamilyTrip(authorization, 3, value);
    await fetchFamilyTripHistory(authorization);
    await fetchFamilyTripHistoryVersion(authorization, 2);
    await restoreFamilyTripVersion(authorization, 3, 2);

    assert.deepEqual(captured.map((entry) => entry.body), [
      { action: "read", authMode: "family_key", key: "family-key" },
      { action: "write", authMode: "family_key", key: "family-key", expectedVersion: 3, payload: value },
      { action: "history", authMode: "family_key", key: "family-key" },
      { action: "history_version", authMode: "family_key", key: "family-key", version: 2 },
      { action: "restore", authMode: "family_key", key: "family-key", expectedVersion: 3, sourceVersion: 2 },
    ]);
    assert.equal(captured.every((entry) => entry.credentials === "same-origin"), true);
    assert.equal(captured.some((entry) => Object.hasOwn(entry.body, "deviceToken")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("shared-plan device authorization uses only the protected cookie selector", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ status: "empty", version: 0, payload: null }), { status: 200 });
  };

  try {
    await fetchFamilyTrip({
      mode: "device_cookie",
      role: "viewer",
      label: "Grandma phone",
      deviceId: "device-2",
    });
    assert.deepEqual(body, { action: "read", authMode: "device_cookie" });
    assert.equal(Object.hasOwn(body, "key"), false);
    assert.equal(Object.hasOwn(body, "deviceToken"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("every protected shared-plan client disconnects on 401 without selecting the saved family key", async () => {
  const previousWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const store = new Map([[FAMILY_KEY_STORAGE_KEY, "family-key"]]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  };
  const captured = [];
  globalThis.fetch = async (_url, options) => {
    captured.push(JSON.parse(options.body));
    return new Response(JSON.stringify({
      status: "unauthorized",
      authState: "rejected_device_token",
      message: "Reconnect with a new invite.",
    }), { status: 401, headers: { "Content-Type": "application/json" } });
  };
  const authorization = {
    mode: "device_cookie",
    role: "editor",
    label: "Katie iPhone",
    deviceId: "device-1",
  };
  const calls = [
    () => fetchFamilyTrip(authorization),
    () => saveFamilyTrip(authorization, 2, payload("Blocked write")),
    () => fetchFamilyTripHistory(authorization),
    () => fetchFamilyTripHistoryVersion(authorization, 1),
    () => restoreFamilyTripVersion(authorization, 2, 1),
  ];

  try {
    for (const call of calls) {
      store.set(FAMILY_DEVICE_ACCESS_STORAGE_KEY, JSON.stringify({
        deviceId: "device-1",
        displayName: "Katie iPhone",
        role: "editor",
        savedAt: "2026-08-24T12:00:00.000Z",
        storage: "protected_cookie",
      }));
      store.set(FAMILY_AUTHORIZATION_MODE_STORAGE_KEY, "device_cookie");
      await assert.rejects(call, FamilyTripSyncError);
      assert.equal(store.has(FAMILY_DEVICE_ACCESS_STORAGE_KEY), false);
      assert.equal(store.get(FAMILY_AUTHORIZATION_MODE_STORAGE_KEY), "disconnected");
      assert.equal(store.get(FAMILY_KEY_STORAGE_KEY), "family-key");
    }
    assert.deepEqual(captured.map((body) => body.action), [
      "read",
      "write",
      "history",
      "history_version",
      "restore",
    ]);
    assert.equal(captured.every((body) => body.authMode === "device_cookie"), true);
    assert.equal(captured.some((body) => Object.hasOwn(body, "key")), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
