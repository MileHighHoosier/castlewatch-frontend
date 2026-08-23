import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeCredentialToken } from "../app/lib/familyTripDevices.ts";


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
});
