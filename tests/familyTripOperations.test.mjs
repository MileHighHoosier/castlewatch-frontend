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
  assert.equal(report.monthlyProjection.projectionDays, 30);
  assert.equal(report.monthlyProjection.reliability, "early_estimate");
  assert.equal(report.costEstimates.estimatedFullReadsPerRailwayEgressDollar, null);
  assert.equal(report.controls.readOnlyReport, false);
  assert.deepEqual(report.warnings, [
    { level: "warning", code: "payload_growing", message: "Growing" },
  ]);
});

test("operations parser preserves monthly projection and guardrail values", () => {
  const report = parseFamilyTripOperationsReport({
    status: "ok",
    monthlyProjection: {
      projectionDays: 30,
      observedDailyVersionRate: 1.43,
      projectedGuardedAutosaves: 43,
      projectedRailwayEgressBytesFromAutosaves: 440320,
      illustrativeFamilyReadChecks: 60,
      illustrativeFamilyRailwayEgressBytes: 747520,
      illustrativeFamilyRailwayEgressUsd: 0.0000348,
      reliability: "moderate",
      note: "Projection note",
    },
    costEstimates: {
      estimatedFullReadsPerRailwayEgressDollar: 100000,
      estimatedGuardedAutosavesPerRailwayEgressDollar: 50000,
    },
    controls: {
      monthlyEgressWarningBytes: 1073741824,
      monthlyEgressCriticalBytes: 10737418240,
    },
  });

  assert.equal(report.monthlyProjection.observedDailyVersionRate, 1.43);
  assert.equal(report.monthlyProjection.projectedGuardedAutosaves, 43);
  assert.equal(report.monthlyProjection.illustrativeFamilyReadChecks, 60);
  assert.equal(report.monthlyProjection.illustrativeFamilyRailwayEgressUsd, 0.0000348);
  assert.equal(report.monthlyProjection.reliability, "moderate");
  assert.equal(report.costEstimates.estimatedFullReadsPerRailwayEgressDollar, 100000);
  assert.equal(report.costEstimates.estimatedGuardedAutosavesPerRailwayEgressDollar, 50000);
  assert.equal(report.controls.monthlyEgressWarningBytes, 1073741824);
  assert.equal(report.controls.monthlyEgressCriticalBytes, 10737418240);
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
      monthlyProjection: {
        projectionDays: 30,
        projectedGuardedAutosaves: 15,
        illustrativeFamilyReadChecks: 60,
        reliability: "moderate",
      },
      costEstimates: {
        estimatedRailwayEgressUsdPerFullRead: 0.0000001967,
        estimatedFullReadsPerRailwayEgressDollar: 5083884,
      },
      pricingAssumptions: { railwayNetworkEgressUsdPerGiB: 0.05 },
      controls: {
        readOnlyReport: true,
        telemetryRowsWritten: false,
        monthlyEgressWarningBytes: 1073741824,
      },
      warnings: [],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const report = await fetchFamilyTripOperations({
      mode: "family_key",
      key: "  family-key  ",
      role: "owner",
      label: "Family key",
    });
    assert.equal(capturedUrl, "/api/castlewatch-family-sync");
    assert.equal(capturedOptions.method, "POST");
    assert.equal(capturedOptions.cache, "no-store");
    assert.equal(capturedOptions.credentials, "same-origin");
    assert.deepEqual(JSON.parse(capturedOptions.body), {
      action: "operations",
      authMode: "family_key",
      key: "family-key",
    });
    assert.equal(report.storage.currentVersion, 11);
    assert.equal(report.monthlyProjection.projectedGuardedAutosaves, 15);
    assert.equal(report.monthlyProjection.illustrativeFamilyReadChecks, 60);
    assert.equal(report.costEstimates.estimatedFullReadsPerRailwayEgressDollar, 5083884);
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
      () => fetchFamilyTripOperations({
        mode: "family_key",
        key: "wrong",
        role: "owner",
        label: "Family key",
      }),
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

test("operations client selects the protected device without exposing a token", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ status: "ok", warnings: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await fetchFamilyTripOperations({
      mode: "device_cookie",
      role: "editor",
      label: "Katie iPhone",
      deviceId: "device-1",
    });
    assert.deepEqual(body, { action: "operations", authMode: "device_cookie" });
    assert.equal(Object.hasOwn(body, "key"), false);
    assert.equal(Object.hasOwn(body, "deviceToken"), false);
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
