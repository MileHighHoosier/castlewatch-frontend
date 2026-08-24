import test from "node:test";
import assert from "node:assert/strict";
import {
  FAMILY_AUTHORIZATION_MODE_STORAGE_KEY,
  FAMILY_KEY_STORAGE_KEY,
  canReadFamilyTrip,
  canRestoreFamilyTrip,
  canViewFamilyTripOperations,
  canWriteFamilyTrip,
  familyTripAuthorizationPayload,
  loadFamilyTripAuthorization,
  normalizeFamilyTripRole,
  saveFamilyTripAuthorizationMode,
} from "../app/lib/familyTripAuthorization.ts";
import { FAMILY_DEVICE_ACCESS_STORAGE_KEY } from "../app/lib/familyTripDevices.ts";

function installStorage() {
  const previousWindow = globalThis.window;
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  };
  return {
    store,
    restore() {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    },
  };
}

function saveProtectedDevice(store, role = "editor") {
  store.set(FAMILY_DEVICE_ACCESS_STORAGE_KEY, JSON.stringify({
    deviceId: "device-1",
    displayName: "Katie iPhone",
    role,
    savedAt: "2026-08-24T12:00:00.000Z",
    storage: "protected_cookie",
  }));
}

test("authorization capability matrix matches Owner, Editor, and Viewer contracts", () => {
  const owner = { mode: "family_key", key: "family-key", role: "owner", label: "Family key" };
  const editor = { mode: "device_cookie", role: "editor", label: "Katie iPhone", deviceId: "device-1" };
  const viewer = { mode: "device_cookie", role: "viewer", label: "Grandma phone", deviceId: "device-2" };

  for (const authorization of [owner, editor, viewer]) {
    assert.equal(canReadFamilyTrip(authorization), true);
  }
  assert.equal(canWriteFamilyTrip(owner), true);
  assert.equal(canWriteFamilyTrip(editor), true);
  assert.equal(canWriteFamilyTrip(viewer), false);
  assert.equal(canRestoreFamilyTrip(owner), true);
  assert.equal(canRestoreFamilyTrip(editor), true);
  assert.equal(canRestoreFamilyTrip(viewer), false);
  assert.equal(canViewFamilyTripOperations(owner), true);
  assert.equal(canViewFamilyTripOperations(editor), true);
  assert.equal(canViewFamilyTripOperations(viewer), false);
});

test("authorization payloads contain exactly one credential selector", () => {
  assert.deepEqual(familyTripAuthorizationPayload({
    mode: "family_key",
    key: "  family-key  ",
    role: "owner",
    label: "Family key",
  }), { authMode: "family_key", key: "family-key" });
  assert.deepEqual(familyTripAuthorizationPayload({
    mode: "device_cookie",
    role: "editor",
    label: "Katie iPhone",
    deviceId: "device-1",
  }), { authMode: "device_cookie" });
});

test("protected device is the conservative default when no mode was selected", () => {
  const storage = installStorage();
  try {
    storage.store.set(FAMILY_KEY_STORAGE_KEY, "family-key");
    saveProtectedDevice(storage.store, "editor");
    const authorization = loadFamilyTripAuthorization();
    assert.equal(authorization?.mode, "device_cookie");
    assert.equal(authorization?.role, "editor");
  } finally {
    storage.restore();
  }
});

test("explicit credential selection never falls back when its credential is absent", () => {
  const storage = installStorage();
  try {
    storage.store.set(FAMILY_KEY_STORAGE_KEY, "family-key");
    saveFamilyTripAuthorizationMode("device_cookie");
    assert.equal(storage.store.get(FAMILY_AUTHORIZATION_MODE_STORAGE_KEY), "device_cookie");
    assert.equal(loadFamilyTripAuthorization(), null);

    saveProtectedDevice(storage.store, "viewer");
    saveFamilyTripAuthorizationMode("family_key");
    storage.store.delete(FAMILY_KEY_STORAGE_KEY);
    assert.equal(loadFamilyTripAuthorization(), null);
  } finally {
    storage.restore();
  }
});

test("disconnect remains explicit even while recovery credentials are available", () => {
  const storage = installStorage();
  try {
    storage.store.set(FAMILY_KEY_STORAGE_KEY, "family-key");
    saveProtectedDevice(storage.store, "owner");
    saveFamilyTripAuthorizationMode(null);
    assert.equal(storage.store.get(FAMILY_AUTHORIZATION_MODE_STORAGE_KEY), "disconnected");
    assert.equal(loadFamilyTripAuthorization(), null);
  } finally {
    storage.restore();
  }
});

test("unrecognized stored roles degrade to Viewer permissions", () => {
  const storage = installStorage();
  try {
    saveProtectedDevice(storage.store, "administrator");
    const authorization = loadFamilyTripAuthorization();
    assert.equal(normalizeFamilyTripRole("administrator"), "viewer");
    assert.equal(authorization?.role, "viewer");
    assert.equal(canWriteFamilyTrip(authorization), false);
    assert.equal(canViewFamilyTripOperations(authorization), false);
  } finally {
    storage.restore();
  }
});
