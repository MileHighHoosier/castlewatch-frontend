import test from "node:test";
import assert from "node:assert/strict";
import {
  FAMILY_DEVICE_ACCESS_STORAGE_KEY,
  FamilyTripDeviceError,
  acceptFamilyTripInvite,
  bootstrapFamilyOwnerDevice,
  checkFamilyTripDeviceAccess,
  clearFamilyDeviceAccess,
  clearProtectedFamilyDeviceAccess,
  createFamilyTripInvite,
  hasLegacyFamilyDeviceAccess,
  listFamilyTripDevices,
  loadFamilyDeviceAccess,
  migrateLegacyFamilyDeviceAccess,
  parseFamilyTripAcceptInviteResponse,
  parseFamilyTripDeviceAccessResponse,
  parseFamilyTripDevicesResponse,
  parseFamilyTripInviteResponse,
  renameFamilyTripDevice,
  revokeFamilyTripDevice,
  saveFamilyDeviceAccess,
  summarizeFamilyTripDevices,
} from "../app/lib/familyTripDevices.ts";

const SAFE_DEVICE = {
  id: "device-1",
  displayName: "Katie iPhone",
  role: "editor",
  status: "active",
  tokenPrefix: "dev123",
  createdAt: null,
  lastSeenAt: null,
  lastReadAt: null,
  lastWriteAt: null,
  revokedAt: null,
};

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

test("device list parser keeps safe device metadata", () => {
  const parsed = parseFamilyTripDevicesResponse({
    status: "ok",
    devices: [
      {
        ...SAFE_DEVICE,
        role: "owner",
        token_hash: "must-not-leak",
        rawToken: "must-not-leak",
      },
      { displayName: "missing id" },
    ],
  });

  assert.equal(parsed.status, "ok");
  assert.equal(parsed.devices.length, 1);
  assert.equal(parsed.devices[0].id, "device-1");
  assert.equal(parsed.devices[0].role, "owner");
  assert.equal(Object.hasOwn(parsed.devices[0], "token_hash"), false);
  assert.equal(Object.hasOwn(parsed.devices[0], "rawToken"), false);
});

test("device list summary distinguishes active and revoked records", () => {
  assert.equal(summarizeFamilyTripDevices([]), "No device records are listed yet.");
  assert.equal(
    summarizeFamilyTripDevices([
      { ...SAFE_DEVICE, id: "device-1", status: "revoked", revokedAt: "2026-07-08T20:33:42Z" },
      { ...SAFE_DEVICE, id: "device-2", status: "revoked", revokedAt: "2026-07-08T20:18:14Z" },
    ]),
    "Loaded 2 device records: 0 active, 2 revoked.",
  );
  assert.equal(
    summarizeFamilyTripDevices([
      SAFE_DEVICE,
      { ...SAFE_DEVICE, id: "device-2", status: "revoked", revokedAt: "2026-07-08T20:18:14Z" },
    ]),
    "Loaded 2 device records: 1 active, 1 revoked.",
  );
});

test("access parser keeps family-key, revoked-token, and rejected-token states explicit", () => {
  const familyKey = parseFamilyTripDeviceAccessResponse({
    status: "ok",
    authState: "family_key",
    role: "owner",
    canManageDevices: true,
    canWriteSharedPlan: true,
    migrationRecommended: true,
  });
  assert.equal(familyKey.authState, "family_key");
  assert.equal(familyKey.canManageDevices, true);
  assert.equal(familyKey.device, null);

  const revoked = parseFamilyTripDeviceAccessResponse({
    status: "revoked",
    authState: "revoked_device_token",
    canManageDevices: false,
    canWriteSharedPlan: false,
    device: { ...SAFE_DEVICE, status: "revoked", token_hash: "must-not-leak" },
  });
  assert.equal(revoked.authState, "revoked_device_token");
  assert.equal(revoked.device?.status, "revoked");
  assert.equal(Object.hasOwn(revoked.device ?? {}, "token_hash"), false);

  const rejected = parseFamilyTripDeviceAccessResponse({
    status: "unauthorized",
    authState: "rejected_device_token",
    message: "Reconnect with a new invite.",
  });
  assert.equal(rejected.authState, "rejected_device_token");
  assert.equal(rejected.device, null);
  assert.equal(rejected.canManageDevices, false);
});

test("invite parser exposes an invite once while accepted-device parsing drops raw credentials", () => {
  const invite = parseFamilyTripInviteResponse({
    status: "ok",
    inviteToken: "cwinv_once",
    invite: {
      id: "invite-1",
      role: "editor",
      status: "open",
      invitePrefix: "inv123",
      label: "Katie iPhone",
      invite_hash: "must-not-leak",
    },
  });
  assert.equal(invite.inviteToken, "cwinv_once");
  assert.equal(Object.hasOwn(invite.invite ?? {}, "invite_hash"), false);

  const accepted = parseFamilyTripAcceptInviteResponse({
    status: "ok",
    deviceToken: "cwdev_must_not_reach_javascript",
    device: SAFE_DEVICE,
  });
  assert.equal(accepted.device?.displayName, "Katie iPhone");
  assert.equal(Object.hasOwn(accepted, "deviceToken"), false);
  assert.equal(JSON.stringify(accepted).includes("cwdev_must_not_reach_javascript"), false);
});

test("protected device metadata storage never writes a raw credential", () => {
  const storage = installStorage();
  try {
    saveFamilyDeviceAccess(SAFE_DEVICE);
    const storedRaw = storage.store.get(FAMILY_DEVICE_ACCESS_STORAGE_KEY);
    assert.equal(storedRaw.includes("cwdev_"), false);
    assert.equal(storedRaw.includes("deviceToken"), false);
    const access = loadFamilyDeviceAccess();
    assert.equal(access?.deviceId, "device-1");
    assert.equal(access?.displayName, "Katie iPhone");
    assert.equal(access?.storage, "protected_cookie");

    clearFamilyDeviceAccess();
    assert.equal(loadFamilyDeviceAccess(), null);
  } finally {
    storage.restore();
  }
});

test("legacy local token is removed only after protected migration is acknowledged", async () => {
  const storage = installStorage();
  const originalFetch = globalThis.fetch;
  storage.store.set(FAMILY_DEVICE_ACCESS_STORAGE_KEY, JSON.stringify({
    deviceToken: "cwdev_legacy_local",
    deviceId: "device-1",
    displayName: "Katie iPhone",
    role: "editor",
    savedAt: "before",
  }));
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      status: "ok",
      authState: "device_token",
      role: "editor",
      device: SAFE_DEVICE,
      canManageDevices: false,
      canWriteSharedPlan: true,
      migrationRecommended: false,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    assert.equal(hasLegacyFamilyDeviceAccess(), true);
    const result = await migrateLegacyFamilyDeviceAccess();
    assert.equal(result?.authState, "device_token");
    assert.deepEqual(requestBody, {
      action: "device_credential_migrate",
      deviceToken: "cwdev_legacy_local",
    });
    const storedRaw = storage.store.get(FAMILY_DEVICE_ACCESS_STORAGE_KEY);
    assert.equal(storedRaw.includes("cwdev_legacy_local"), false);
    assert.equal(storedRaw.includes("deviceToken"), false);
    assert.equal(hasLegacyFamilyDeviceAccess(), false);
    assert.equal(loadFamilyDeviceAccess()?.storage, "protected_cookie");
  } finally {
    globalThis.fetch = originalFetch;
    storage.restore();
  }
});

test("failed protected migration retains the legacy token for explicit recovery", async () => {
  const storage = installStorage();
  const originalFetch = globalThis.fetch;
  storage.store.set(FAMILY_DEVICE_ACCESS_STORAGE_KEY, JSON.stringify({
    deviceToken: "cwdev_legacy_local",
    deviceId: "device-1",
    displayName: "Katie iPhone",
    role: "editor",
    savedAt: "before",
  }));
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "unauthorized",
    message: "The device credential was not accepted.",
  }), { status: 401, headers: { "Content-Type": "application/json" } });

  try {
    await assert.rejects(() => migrateLegacyFamilyDeviceAccess(), FamilyTripDeviceError);
    assert.equal(hasLegacyFamilyDeviceAccess(), true);
    assert.ok(storage.store.get(FAMILY_DEVICE_ACCESS_STORAGE_KEY).includes("cwdev_legacy_local"));
  } finally {
    globalThis.fetch = originalFetch;
    storage.restore();
  }
});

test("concurrent migration attempts share one server acknowledgment", async () => {
  const storage = installStorage();
  const originalFetch = globalThis.fetch;
  storage.store.set(FAMILY_DEVICE_ACCESS_STORAGE_KEY, JSON.stringify({
    deviceToken: "cwdev_legacy_local",
    deviceId: "device-1",
    displayName: "Katie iPhone",
    role: "editor",
    savedAt: "before",
  }));
  let fetchCount = 0;
  let releaseRequest;
  globalThis.fetch = async () => {
    fetchCount += 1;
    await new Promise((resolve) => {
      releaseRequest = resolve;
    });
    return new Response(JSON.stringify({
      status: "ok",
      authState: "device_token",
      role: "editor",
      device: SAFE_DEVICE,
      canManageDevices: false,
      canWriteSharedPlan: true,
      migrationRecommended: false,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const first = migrateLegacyFamilyDeviceAccess();
    const second = migrateLegacyFamilyDeviceAccess();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fetchCount, 1);
    releaseRequest();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(firstResult?.device?.id, "device-1");
    assert.equal(secondResult?.device?.id, "device-1");
    assert.equal(hasLegacyFamilyDeviceAccess(), false);
  } finally {
    globalThis.fetch = originalFetch;
    storage.restore();
  }
});

test("device clients send explicit credential modes without raw device tokens", async () => {
  const storage = installStorage();
  const originalFetch = globalThis.fetch;
  const captured = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    captured.push({ url, body });
    if (body.action === "device_access_check") {
      return new Response(JSON.stringify({
        status: "ok",
        authState: "device_token",
        role: "editor",
        device: SAFE_DEVICE,
        canManageDevices: false,
        canWriteSharedPlan: true,
        migrationRecommended: false,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (body.action === "device_list") {
      return new Response(JSON.stringify({ status: "ok", devices: [SAFE_DEVICE] }), { status: 200 });
    }
    if (body.action === "device_invite_create") {
      return new Response(JSON.stringify({
        status: "ok",
        inviteToken: "cwinv_once",
        invite: { id: "invite-1", role: "editor", status: "open", label: "Katie" },
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ status: "ok", device: SAFE_DEVICE }), { status: 200 });
  };

  try {
    await checkFamilyTripDeviceAccess({ mode: "device_cookie" });
    await listFamilyTripDevices({ mode: "family_key", key: " family-key " });
    await createFamilyTripInvite({ mode: "device_cookie" }, { role: "editor", label: "Katie" });
    await acceptFamilyTripInvite(" cwinv_once ", " Katie iPhone ");
    await bootstrapFamilyOwnerDevice(" family-key ", " Owner iPhone ");
    await renameFamilyTripDevice({ mode: "family_key", key: "family-key" }, "device-1", " Katie iPhone 2 ");
    await revokeFamilyTripDevice({ mode: "device_cookie" }, "device-1");
    await clearProtectedFamilyDeviceAccess();

    assert.deepEqual(captured.map((call) => call.body.action), [
      "device_access_check",
      "device_list",
      "device_invite_create",
      "device_invite_accept",
      "device_owner_bootstrap",
      "device_rename",
      "device_revoke",
      "device_credential_clear",
    ]);
    assert.deepEqual(captured[0].body, { action: "device_access_check", authMode: "device_cookie" });
    assert.deepEqual(captured[1].body, { action: "device_list", authMode: "family_key", key: "family-key" });
    assert.deepEqual(captured[2].body, {
      action: "device_invite_create",
      authMode: "device_cookie",
      role: "editor",
      label: "Katie",
    });
    assert.deepEqual(captured[3].body, {
      action: "device_invite_accept",
      inviteToken: "cwinv_once",
      deviceName: "Katie iPhone",
    });
    assert.deepEqual(captured[4].body, {
      action: "device_owner_bootstrap",
      authMode: "family_key",
      key: "family-key",
      deviceName: "Owner iPhone",
    });
    assert.deepEqual(captured[5].body, {
      action: "device_rename",
      authMode: "family_key",
      key: "family-key",
      deviceId: "device-1",
      displayName: "Katie iPhone 2",
    });
    assert.deepEqual(captured[6].body, {
      action: "device_revoke",
      authMode: "device_cookie",
      deviceId: "device-1",
    });
    assert.equal(captured.some((call) => Object.hasOwn(call.body, "deviceToken")), false);
    assert.equal(loadFamilyDeviceAccess(), null);
  } finally {
    globalThis.fetch = originalFetch;
    storage.restore();
  }
});

test("access client returns revoked state without silent family-key fallback", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({
      status: "revoked",
      authState: "revoked_device_token",
      message: "This protected device credential was revoked.",
      canManageDevices: false,
      canWriteSharedPlan: false,
      migrationRecommended: false,
      device: { ...SAFE_DEVICE, status: "revoked" },
    }), { status: 401, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await checkFamilyTripDeviceAccess({ mode: "device_cookie" });
    assert.equal(result.authState, "revoked_device_token");
    assert.deepEqual(body, { action: "device_access_check", authMode: "device_cookie" });
    assert.equal(Object.hasOwn(body, "key"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("access client returns a rejected protected-cookie state without silent fallback", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({
      status: "unauthorized",
      authState: "rejected_device_token",
      message: "The protected device credential was rejected.",
      canManageDevices: false,
      canWriteSharedPlan: false,
      migrationRecommended: false,
      device: null,
    }), { status: 401, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await checkFamilyTripDeviceAccess({ mode: "device_cookie" });
    assert.equal(result.authState, "rejected_device_token");
    assert.deepEqual(body, { action: "device_access_check", authMode: "device_cookie" });
    assert.equal(Object.hasOwn(body, "key"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("device client preserves safe upstream error messages", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "forbidden",
    message: "This device is not allowed to perform the requested manage action.",
  }), { status: 403, headers: { "Content-Type": "application/json" } });

  try {
    await assert.rejects(
      () => listFamilyTripDevices({ mode: "device_cookie" }),
      (error) => {
        assert.ok(error instanceof FamilyTripDeviceError);
        assert.equal(error.statusCode, 403);
        assert.equal(error.message, "This device is not allowed to perform the requested manage action.");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
