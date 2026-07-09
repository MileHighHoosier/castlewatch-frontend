import test from "node:test";
import assert from "node:assert/strict";
import {
  FAMILY_DEVICE_ACCESS_STORAGE_KEY,
  FamilyTripDeviceError,
  acceptFamilyTripInvite,
  checkFamilyTripDeviceAccess,
  clearFamilyDeviceAccess,
  createFamilyTripInvite,
  listFamilyTripDevices,
  loadFamilyDeviceAccess,
  parseFamilyTripAcceptInviteResponse,
  parseFamilyTripDeviceAccessResponse,
  parseFamilyTripDevicesResponse,
  parseFamilyTripInviteResponse,
  renameFamilyTripDevice,
  revokeFamilyTripDevice,
  saveFamilyDeviceAccess,
} from "../app/lib/familyTripDevices.ts";

test("device list parser keeps safe device metadata", () => {
  const parsed = parseFamilyTripDevicesResponse({
    status: "ok",
    devices: [
      {
        id: "device-1",
        displayName: "Ryan iPhone",
        role: "owner",
        status: "active",
        tokenPrefix: "abc123",
        createdAt: "created",
        lastSeenAt: "seen",
        lastReadAt: "read",
        lastWriteAt: "write",
        revokedAt: null,
        token_hash: "must-not-leak",
        rawToken: "must-not-leak",
      },
      { displayName: "missing id" },
    ],
  });

  assert.equal(parsed.status, "ok");
  assert.equal(parsed.devices.length, 1);
  assert.equal(parsed.devices[0].id, "device-1");
  assert.equal(parsed.devices[0].displayName, "Ryan iPhone");
  assert.equal(parsed.devices[0].role, "owner");
  assert.equal(parsed.devices[0].tokenPrefix, "abc123");
  assert.equal(Object.hasOwn(parsed.devices[0], "token_hash"), false);
  assert.equal(Object.hasOwn(parsed.devices[0], "rawToken"), false);
});

test("access parser keeps family-key and revoked-token states explicit", () => {
  const familyKey = parseFamilyTripDeviceAccessResponse({
    status: "ok",
    authState: "family_key",
    role: "owner",
    canManageDevices: true,
    canWriteSharedPlan: true,
    migrationRecommended: true,
    message: "Using family key.",
  });
  assert.equal(familyKey.authState, "family_key");
  assert.equal(familyKey.role, "owner");
  assert.equal(familyKey.canManageDevices, true);
  assert.equal(familyKey.migrationRecommended, true);
  assert.equal(familyKey.device, null);

  const revoked = parseFamilyTripDeviceAccessResponse({
    status: "revoked",
    authState: "revoked_device_token",
    canManageDevices: false,
    canWriteSharedPlan: false,
    device: {
      id: "device-1",
      displayName: "Safari Test",
      role: "editor",
      status: "revoked",
      tokenPrefix: "dev123",
      token_hash: "must-not-leak",
    },
  });
  assert.equal(revoked.authState, "revoked_device_token");
  assert.equal(revoked.device?.status, "revoked");
  assert.equal(revoked.role, "editor");
  assert.equal(Object.hasOwn(revoked.device ?? {}, "token_hash"), false);
});

test("invite and accept parsers preserve one-time tokens only at top level", () => {
  const invite = parseFamilyTripInviteResponse({
    status: "ok",
    inviteToken: "cwinv_once",
    invite: {
      id: "invite-1",
      role: "editor",
      status: "open",
      invitePrefix: "inv123",
      label: "Katie iPhone",
      expiresAt: "expires",
      createdAt: "created",
      acceptedAt: null,
      invite_hash: "must-not-leak",
    },
  });
  assert.equal(invite.inviteToken, "cwinv_once");
  assert.equal(invite.invite?.label, "Katie iPhone");
  assert.equal(Object.hasOwn(invite.invite ?? {}, "invite_hash"), false);

  const accepted = parseFamilyTripAcceptInviteResponse({
    status: "ok",
    deviceToken: "cwdev_once",
    device: {
      id: "device-1",
      displayName: "Katie iPhone",
      role: "editor",
      status: "active",
      tokenPrefix: "dev123",
    },
  });
  assert.equal(accepted.deviceToken, "cwdev_once");
  assert.equal(accepted.device?.displayName, "Katie iPhone");
  assert.equal(JSON.stringify(accepted.device).includes("cwdev_once"), false);
});

test("local device access storage keeps token local and clears safely", () => {
  const previousWindow = globalThis.window;
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  };

  try {
    saveFamilyDeviceAccess("  cwdev_local  ", {
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
    });
    const storedRaw = store.get(FAMILY_DEVICE_ACCESS_STORAGE_KEY);
    assert.ok(storedRaw.includes("cwdev_local"));
    const access = loadFamilyDeviceAccess();
    assert.equal(access?.deviceToken, "cwdev_local");
    assert.equal(access?.deviceId, "device-1");
    assert.equal(access?.displayName, "Katie iPhone");
    assert.equal(access?.role, "editor");

    clearFamilyDeviceAccess();
    assert.equal(loadFamilyDeviceAccess(), null);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test("device clients send typed proxy actions", async () => {
  const originalFetch = globalThis.fetch;
  const captured = [];
  globalThis.fetch = async (url, options) => {
    captured.push({ url, options, body: JSON.parse(options.body) });
    const action = JSON.parse(options.body).action;
    if (action === "device_access_check") {
      return new Response(JSON.stringify({
        status: "ok",
        authState: "device_token",
        role: "editor",
        device: { id: "device-1", displayName: "Katie iPhone", role: "editor", status: "active" },
        canManageDevices: false,
        canWriteSharedPlan: true,
        migrationRecommended: false,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (action === "device_list") {
      return new Response(JSON.stringify({
        status: "ok",
        devices: [{ id: "device-1", displayName: "Ryan iPhone", role: "owner", status: "active" }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (action === "device_invite_create") {
      return new Response(JSON.stringify({
        status: "ok",
        inviteToken: "cwinv_once",
        invite: { id: "invite-1", role: "editor", status: "open", label: "Katie" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (action === "device_invite_accept") {
      return new Response(JSON.stringify({
        status: "ok",
        deviceToken: "cwdev_once",
        device: { id: "device-2", displayName: "Katie iPhone", role: "editor", status: "active" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      status: "ok",
      device: { id: "device-2", displayName: "Katie iPhone 2", role: "editor", status: action === "device_revoke" ? "revoked" : "active" },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    await checkFamilyTripDeviceAccess({ deviceToken: " device-token " });
    await listFamilyTripDevices({ key: " family-key " });
    await createFamilyTripInvite({ deviceToken: " owner-device " }, { role: "editor", label: "Katie" });
    await acceptFamilyTripInvite(" cwinv_once ", " Katie iPhone ");
    await renameFamilyTripDevice({ key: "family-key" }, "device-2", " Katie iPhone 2 ");
    await revokeFamilyTripDevice({ deviceToken: "owner-device" }, "device-2");

    assert.deepEqual(captured.map((call) => call.url), [
      "/api/castlewatch-family-sync",
      "/api/castlewatch-family-sync",
      "/api/castlewatch-family-sync",
      "/api/castlewatch-family-sync",
      "/api/castlewatch-family-sync",
      "/api/castlewatch-family-sync",
    ]);
    assert.deepEqual(captured.map((call) => call.body.action), [
      "device_access_check",
      "device_list",
      "device_invite_create",
      "device_invite_accept",
      "device_rename",
      "device_revoke",
    ]);
    assert.deepEqual(captured[0].body, { action: "device_access_check", deviceToken: "device-token" });
    assert.deepEqual(captured[1].body, { action: "device_list", key: "family-key" });
    assert.deepEqual(captured[2].body, {
      action: "device_invite_create",
      deviceToken: "owner-device",
      role: "editor",
      label: "Katie",
    });
    assert.deepEqual(captured[3].body, {
      action: "device_invite_accept",
      inviteToken: "cwinv_once",
      deviceName: "Katie iPhone",
    });
    assert.deepEqual(captured[4].body, {
      action: "device_rename",
      key: "family-key",
      deviceId: "device-2",
      displayName: "Katie iPhone 2",
    });
    assert.deepEqual(captured[5].body, {
      action: "device_revoke",
      deviceToken: "owner-device",
      deviceId: "device-2",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("access client returns revoked state without throwing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "revoked",
    authState: "revoked_device_token",
    message: "This saved device token was revoked. Reconnect with a new invite or use the family key.",
    canManageDevices: false,
    canWriteSharedPlan: false,
    migrationRecommended: false,
    device: { id: "device-2", displayName: "Safari Test", role: "editor", status: "revoked" },
  }), { status: 401, headers: { "Content-Type": "application/json" } });

  try {
    const result = await checkFamilyTripDeviceAccess({ deviceToken: "revoked-device" });
    assert.equal(result.status, "revoked");
    assert.equal(result.authState, "revoked_device_token");
    assert.equal(result.device?.status, "revoked");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("device client preserves upstream error messages", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "forbidden",
    message: "This device is not allowed to perform the requested manage action.",
  }), { status: 403, headers: { "Content-Type": "application/json" } });

  try {
    await assert.rejects(
      () => listFamilyTripDevices({ deviceToken: "viewer-device" }),
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
