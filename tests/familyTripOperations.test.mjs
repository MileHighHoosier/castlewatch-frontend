import test from "node:test";
import assert from "node:assert/strict";
import {
  FamilyTripOperationsError,
  fetchFamilyTripOperations,
  formatOperationsBytes,
  formatOperationsCost,
  parseFamilyTripOperationsReport,
} from "../app/lib/familyTripOperations.ts";

test("operations report parser normalizes missing values safely", () => {
  const report = parseFamilyTripOperationsReport({
    status: "ok",
    storage: { currentVersion: 11, currentPayloadBytes: 4096 },
    warnings: [{ level: "warning", code: "payload_growing", message: "Growing" }],
  });

  assert.equal(report.status, "ok");
  assert.equal(report.storage.currentVersion, 11);
  assert.equal(report.storage.currentPayloadBytes, 4096);
  assert.equal(report.storage.historyLimit, 25);
  assert.equal(report.controls.readOnlyReport, false);
  assert.deepEqual(report.warnings, [
    { level: "warning", code: "payload_growing", message: "Growing" },
  ]);
});

test("operations client sends a protected read-only proxy action", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl;
  let capturedOptions;
  globalThis.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return new Response(JSON.stringify({
      status: "ok",
      generatedAt: "2026-07-05T12:00:00+00:00",
      storage: {
        currentVersion: 11,
        currentPayloadBytes: 3200,
        payloadLimitBytes: 500000,
        retainedHistoryCount: 7,
        historyLimit: 25,
      },
      activity: { versionsRetained: 7 },
      transferEstimates: { estimatedRailwayEgressBytesPerFullRead: 4224 },
      costEstimates: { estimatedRailwayEgressUsdPerFullRead: 0.0000001967 },
      pricingAssumptions: { railwayNetworkEgressUsdPerGiB: 0.05 },
      controls: { readOnlyReport: true, telemetryRowsWritten: false },
      warnings: [],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const report = await fetchFamilyTripOperations("  family-key  ");
    assert.equal(capturedUrl, "/api/castlewatch-family-sync");
    assert.equal(capturedOptions.method, "POST");
    assert.equal(capturedOptions.cache, "no-store");
    assert.deepEqual(JSON.parse(capturedOptions.body), {
      action: "operations",
      key: "family-key",
    });
    assert.equal(report.storage.currentVersion, 11);
    assert.equal(report.controls.readOnlyReport, true);
    assert.equal(report.controls.telemetryRowsWritten, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("operations client preserves upstream error details", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "unauthorized",
    message: "The CastleWatch family key is missing or incorrect.",
  }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

  try {
    await assert.rejects(
      () => fetchFamilyTripOperations("wrong"),
      (error) => {
        assert.ok(error instanceof FamilyTripOperationsError);
        assert.equal(error.statusCode, 401);
        assert.equal(error.message, "The CastleWatch family key is missing or incorrect.");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("operations formatting keeps tiny costs and payload sizes understandable", () => {
  assert.equal(formatOperationsBytes(999), "999 B");
  assert.equal(formatOperationsBytes(1536), "1.5 KB");
  assert.equal(formatOperationsBytes(2 * 1024 * 1024), "2.00 MB");
  assert.equal(formatOperationsCost(0), "$0.00");
  assert.equal(formatOperationsCost(0.000004), "<$0.01 (0.000004)");
  assert.equal(formatOperationsCost(1.235), "$1.24");
});
