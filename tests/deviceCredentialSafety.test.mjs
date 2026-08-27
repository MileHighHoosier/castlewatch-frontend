import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeCredentialToken } from "../app/lib/familyTripDevices.ts";
import {
  FAMILY_DEVICE_CREDENTIAL_COOKIE_PATH,
  extractOneTimeDeviceCredential,
  normalizeProtectedDeviceToken,
  protectRejectedDeviceCredential,
  protectedDeviceCredentialCookieOptions,
  sanitizeDeviceCredentialPayload,
  validateSameOriginJsonRequest,
} from "../app/lib/familyTripDeviceProxy.ts";


test("device and invite credentials accept only bounded expected token shapes", () => {
  assert.equal(normalizeCredentialToken("  cwdev_abc123  ", "cwdev_"), "cwdev_abc123");
  assert.equal(normalizeCredentialToken("cwinv_abc123", "cwinv_"), "cwinv_abc123");
  assert.equal(normalizeCredentialToken("wrong_abc123", "cwdev_"), "");
  assert.equal(normalizeCredentialToken("cwdev_bad token", "cwdev_"), "");
  assert.equal(normalizeCredentialToken(`cwdev_${"a".repeat(600)}`, "cwdev_"), "");
});


test("device credential errors do not append raw backend response text", async () => {
  const source = await readFile(new URL("../app/lib/familyTripDevices.ts", import.meta.url), "utf8");

  assert.equal(source.includes("result.rawText"), false);
  assert.equal(source.includes("rawText.slice"), false);
  assert.match(source, /returned HTTP \$\{result\.response\.status\}\./);
});


test("protected credential cookie is HttpOnly, Secure, Strict, and narrowly scoped", () => {
  const options = protectedDeviceCredentialCookieOptions();
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, "strict");
  assert.equal(options.path, "/api/castlewatch-family-sync");
  assert.equal(options.path, FAMILY_DEVICE_CREDENTIAL_COOKIE_PATH);
  assert.ok(options.maxAge > 0);
});


test("protected proxy validates exact device tokens and strips them from browser payloads", () => {
  const token = `cwdev_abcdef_${"a".repeat(64)}`;
  assert.equal(normalizeProtectedDeviceToken(`  ${token}  `), token);
  assert.equal(normalizeProtectedDeviceToken("cwdev_short"), "");

  const extracted = extractOneTimeDeviceCredential({
    status: "ok",
    deviceToken: token,
    device: {
      id: "device-1",
      tokenHash: "must-not-leak",
      rawToken: token,
      note: `credential ${token}`,
    },
  });
  assert.equal(extracted.deviceToken, token);
  const serialized = JSON.stringify(extracted.safePayload);
  assert.equal(serialized.includes(token), false);
  assert.equal(serialized.includes("tokenHash"), false);
  assert.equal(serialized.includes("rawToken"), false);

  const separatelySanitized = sanitizeDeviceCredentialPayload({ nested: [{ deviceToken: token }] });
  assert.equal(JSON.stringify(separatelySanitized).includes(token), false);
});


test("only a rejected selected device cookie is cleared and normalized safely", () => {
  const generic = protectRejectedDeviceCredential({
    status: "unauthorized",
    message: "Internal credential detail",
    deviceToken: "cwdev_secret_should_not_escape",
  }, 401, true);
  assert.equal(generic.clearCredential, true);
  assert.equal(generic.safePayload.authState, "rejected_device_token");
  assert.match(generic.safePayload.message, /Reconnect with a new invite/);
  assert.equal(JSON.stringify(generic.safePayload).includes("Internal credential detail"), false);
  assert.equal(JSON.stringify(generic.safePayload).includes("cwdev_secret"), false);

  const revokedPayload = {
    status: "revoked",
    authState: "revoked_device_token",
    message: "Reconnect this device.",
  };
  const revoked = protectRejectedDeviceCredential(revokedPayload, 401, true);
  assert.equal(revoked.clearCredential, true);
  assert.deepEqual(revoked.safePayload, revokedPayload);

  assert.equal(protectRejectedDeviceCredential({ status: "unauthorized" }, 401, false).clearCredential, false);
  assert.equal(protectRejectedDeviceCredential({ status: "forbidden" }, 403, true).clearCredential, false);
});


test("same-origin JSON guard rejects cross-site and non-JSON credential requests", () => {
  const headers = (entries) => ({
    get: (name) => entries[name.toLowerCase()] ?? null,
  });
  const expected = "https://castlewatch.example";

  assert.equal(validateSameOriginJsonRequest(headers({
    "content-type": "application/json; charset=utf-8",
    origin: expected,
    "sec-fetch-site": "same-origin",
  }), expected), null);
  assert.match(validateSameOriginJsonRequest(headers({
    "content-type": "application/json",
    origin: "https://attacker.example",
    "sec-fetch-site": "cross-site",
  }), expected), /same-origin/);
  assert.match(validateSameOriginJsonRequest(headers({
    "content-type": "text/plain",
    origin: expected,
  }), expected), /application\/json/);
  assert.match(validateSameOriginJsonRequest(headers({
    "content-type": "application/json",
  }), expected), /same-origin request context/);
});


test("same-origin proxy makes credential selection explicit and never returns internal previews", async () => {
  const source = await readFile(new URL("../app/api/castlewatch-family-sync/route.ts", import.meta.url), "utf8");

  assert.match(source, /body\.authMode === "family_key"/);
  assert.match(source, /body\.authMode === "device_cookie"/);
  assert.match(source, /Raw device credentials are accepted only by the one-time migration action/);
  assert.match(source, /Raw device credentials are not accepted by shared-plan actions/);
  assert.match(source, /sharedPlanAction/);
  assert.match(source, /device_owner_bootstrap/);
  assert.match(source, /device_credential_migrate/);
  assert.match(source, /device_credential_clear/);
  assert.match(source, /protectRejectedDeviceCredential/);
  assert.match(source, /if \(rejection\.clearCredential\) clearCredentialCookie\(response\)/);
  assert.match(source, /function protectedCredentialMissingResponse\(\)[\s\S]*clearCredentialCookie\(response\)/);
  assert.equal(source.includes("upstreamPreview"), false);
  assert.equal(source.includes("error.message"), false);
});


test("production proxy smokes send the required same-origin context", async () => {
  const files = [
    "../.github/workflows/device-management-production-smoke.yml",
    "../.github/workflows/operations-production-smoke.yml",
  ];

  for (const relativePath of files) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /--header "Origin: \$\{origin\}"/);
    assert.match(source, /--header 'Sec-Fetch-Site: same-origin'/);
  }
});


test("credential-adjacent family device UI remains declarative and avoids dynamic HTML sinks", async () => {
  const files = [
    "../app/components/FamilyTripDevices.tsx",
    "../app/components/FamilyTripDeviceCredentialDiagnostic.tsx",
  ];

  for (const relativePath of files) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.equal(source.includes(".innerHTML"), false, `${relativePath} must not use innerHTML`);
    assert.equal(source.includes("dangerouslySetInnerHTML"), false, `${relativePath} must not use dangerouslySetInnerHTML`);
  }

  const devicePanel = await readFile(new URL("../app/components/FamilyTripDevices.tsx", import.meta.url), "utf8");
  assert.match(devicePanel, /disconnectRejectedDeviceCredential/);
  assert.match(devicePanel, /value\.statusCode !== 401/);
  assert.match(devicePanel, /saveFamilyTripAuthorizationMode\(null\)/);
  assert.match(devicePanel, /clearFamilyDeviceAccess\(\)/);
});


test("a protected non-owner device has a safe self-rename path", async () => {
  const devicePanel = await readFile(new URL("../app/components/FamilyTripDevices.tsx", import.meta.url), "utf8");
  assert.match(devicePanel, /async function renameCurrentDevice\(\)/);
  assert.match(devicePanel, /renameFamilyTripDevice\(auth, localDevice\.deviceId, displayName\)/);
  assert.match(devicePanel, /aria-label="Rename this device"/);
  assert.match(devicePanel, /busy === "rename-local"/);
  assert.equal(devicePanel.includes("deviceToken"), false);
});
