export type FamilyTripOperationsWarning = {
  level: "info" | "warning" | "critical" | string;
  code: string;
  message: string;
};

export type FamilyTripOperationsReport = {
  status: string;
  generatedAt: string | null;
  scope: string;
  measurement: string;
  storage: {
    currentVersion: number;
    currentUpdatedAt: string | null;
    currentPayloadBytes: number;
    payloadLimitBytes: number;
    payloadLimitUsedPercent: number;
    retainedHistoryCount: number;
    historyLimit: number;
    retainedHistoryBytes: number;
    averageSnapshotBytes: number;
    projectedHistoryBytesAtLimit: number;
    projectedDatabaseJsonBytesAtLimit: number;
  };
  activity: {
    versionsRetained: number;
    versionsCreatedLast24Hours: number;
    versionsCreatedLast7Days: number;
    note: string;
  };
  transferEstimates: {
    estimatedRailwayEgressBytesPerFullRead: number;
    estimatedRailwayEgressBytesPerGuardedAutosave: number;
    note: string;
  };
  monthlyProjection: {
    projectionDays: number;
    observedDailyVersionRate: number;
    projectedGuardedAutosaves: number;
    projectedRailwayEgressBytesFromAutosaves: number;
    illustrativeFamilyReadChecks: number;
    illustrativeFamilyRailwayEgressBytes: number;
    illustrativeFamilyRailwayEgressUsd: number;
    reliability: string;
    note: string;
  };
  costEstimates: {
    estimatedRailwayEgressUsdPerFullRead: number;
    estimatedRailwayEgressUsdPerGuardedAutosave: number;
    estimatedRailwayVolumeUsdPerMonthAtHistoryLimit: number;
    estimatedFullReadsPerRailwayEgressDollar: number | null;
    estimatedGuardedAutosavesPerRailwayEgressDollar: number | null;
    note: string;
  };
  pricingAssumptions: {
    railwayNetworkEgressUsdPerGiB: number;
    railwayVolumeStorageUsdPerGiBMonth: number;
    reviewedAt: string | null;
    source: string;
  };
  controls: {
    readOnlyReport: boolean;
    telemetryRowsWritten: boolean;
    historyLimit: number;
    payloadLimitBytes: number;
    monthlyEgressWarningBytes: number;
    monthlyEgressCriticalBytes: number;
  };
  warnings: FamilyTripOperationsWarning[];
  message?: string;
};

export class FamilyTripOperationsError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    Object.setPrototypeOf(this, FamilyTripOperationsError.prototype);
    this.name = "FamilyTripOperationsError";
    this.statusCode = statusCode;
  }
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function parseWarnings(value: unknown): FamilyTripOperationsWarning[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const code = stringValue(record.code);
    const message = stringValue(record.message);
    if (!code || !message) return [];
    return [{
      level: stringValue(record.level, "info"),
      code,
      message,
    }];
  });
}

export function parseFamilyTripOperationsReport(data: unknown): FamilyTripOperationsReport {
  const root = objectValue(data);
  const storage = objectValue(root.storage);
  const activity = objectValue(root.activity);
  const transfer = objectValue(root.transferEstimates);
  const monthly = objectValue(root.monthlyProjection);
  const costs = objectValue(root.costEstimates);
  const pricing = objectValue(root.pricingAssumptions);
  const controls = objectValue(root.controls);

  return {
    status: stringValue(root.status, "error"),
    generatedAt: nullableString(root.generatedAt),
    scope: stringValue(root.scope, "family_trip"),
    measurement: stringValue(root.measurement, "estimate_from_current_database_state"),
    storage: {
      currentVersion: numberValue(storage.currentVersion),
      currentUpdatedAt: nullableString(storage.currentUpdatedAt),
      currentPayloadBytes: numberValue(storage.currentPayloadBytes),
      payloadLimitBytes: numberValue(storage.payloadLimitBytes),
      payloadLimitUsedPercent: numberValue(storage.payloadLimitUsedPercent),
      retainedHistoryCount: numberValue(storage.retainedHistoryCount),
      historyLimit: numberValue(storage.historyLimit, 25),
      retainedHistoryBytes: numberValue(storage.retainedHistoryBytes),
      averageSnapshotBytes: numberValue(storage.averageSnapshotBytes),
      projectedHistoryBytesAtLimit: numberValue(storage.projectedHistoryBytesAtLimit),
      projectedDatabaseJsonBytesAtLimit: numberValue(storage.projectedDatabaseJsonBytesAtLimit),
    },
    activity: {
      versionsRetained: numberValue(activity.versionsRetained),
      versionsCreatedLast24Hours: numberValue(activity.versionsCreatedLast24Hours),
      versionsCreatedLast7Days: numberValue(activity.versionsCreatedLast7Days),
      note: stringValue(activity.note),
    },
    transferEstimates: {
      estimatedRailwayEgressBytesPerFullRead: numberValue(transfer.estimatedRailwayEgressBytesPerFullRead),
      estimatedRailwayEgressBytesPerGuardedAutosave: numberValue(transfer.estimatedRailwayEgressBytesPerGuardedAutosave),
      note: stringValue(transfer.note),
    },
    monthlyProjection: {
      projectionDays: numberValue(monthly.projectionDays, 30),
      observedDailyVersionRate: numberValue(monthly.observedDailyVersionRate),
      projectedGuardedAutosaves: numberValue(monthly.projectedGuardedAutosaves),
      projectedRailwayEgressBytesFromAutosaves: numberValue(monthly.projectedRailwayEgressBytesFromAutosaves),
      illustrativeFamilyReadChecks: numberValue(monthly.illustrativeFamilyReadChecks),
      illustrativeFamilyRailwayEgressBytes: numberValue(monthly.illustrativeFamilyRailwayEgressBytes),
      illustrativeFamilyRailwayEgressUsd: numberValue(monthly.illustrativeFamilyRailwayEgressUsd),
      reliability: stringValue(monthly.reliability, "early_estimate"),
      note: stringValue(monthly.note),
    },
    costEstimates: {
      estimatedRailwayEgressUsdPerFullRead: numberValue(costs.estimatedRailwayEgressUsdPerFullRead),
      estimatedRailwayEgressUsdPerGuardedAutosave: numberValue(costs.estimatedRailwayEgressUsdPerGuardedAutosave),
      estimatedRailwayVolumeUsdPerMonthAtHistoryLimit: numberValue(costs.estimatedRailwayVolumeUsdPerMonthAtHistoryLimit),
      estimatedFullReadsPerRailwayEgressDollar: nullableNumber(costs.estimatedFullReadsPerRailwayEgressDollar),
      estimatedGuardedAutosavesPerRailwayEgressDollar: nullableNumber(costs.estimatedGuardedAutosavesPerRailwayEgressDollar),
      note: stringValue(costs.note),
    },
    pricingAssumptions: {
      railwayNetworkEgressUsdPerGiB: numberValue(pricing.railwayNetworkEgressUsdPerGiB),
      railwayVolumeStorageUsdPerGiBMonth: numberValue(pricing.railwayVolumeStorageUsdPerGiBMonth),
      reviewedAt: nullableString(pricing.reviewedAt),
      source: stringValue(pricing.source),
    },
    controls: {
      readOnlyReport: Boolean(controls.readOnlyReport),
      telemetryRowsWritten: Boolean(controls.telemetryRowsWritten),
      historyLimit: numberValue(controls.historyLimit, 25),
      payloadLimitBytes: numberValue(controls.payloadLimitBytes),
      monthlyEgressWarningBytes: numberValue(controls.monthlyEgressWarningBytes),
      monthlyEgressCriticalBytes: numberValue(controls.monthlyEgressCriticalBytes),
    },
    warnings: parseWarnings(root.warnings),
    message: typeof root.message === "string" ? root.message : undefined,
  };
}

export async function fetchFamilyTripOperations(key: string): Promise<FamilyTripOperationsReport> {
  const response = await fetch("/api/castlewatch-family-sync", {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "operations",
      key: key.trim(),
    }),
  });

  const rawText = await response.text();
  let data: unknown = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }

  const report = parseFamilyTripOperationsReport(data);
  if (!response.ok) {
    const message = report.message
      || `Operations report returned HTTP ${response.status}${rawText ? `: ${rawText.slice(0, 180)}` : "."}`;
    throw new FamilyTripOperationsError(message, response.status);
  }
  return report;
}

export function formatOperationsBytes(byteCount: number) {
  const safe = Math.max(0, Number.isFinite(byteCount) ? byteCount : 0);
  if (safe < 1024) return `${Math.round(safe)} B`;
  if (safe < 1024 ** 2) return `${(safe / 1024).toFixed(1)} KB`;
  if (safe < 1024 ** 3) return `${(safe / (1024 ** 2)).toFixed(2)} MB`;
  return `${(safe / (1024 ** 3)).toFixed(2)} GB`;
}

export function formatOperationsCost(usd: number) {
  const safe = Math.max(0, Number.isFinite(usd) ? usd : 0);
  if (safe === 0) return "$0.00";
  if (safe < 0.01) return `<$0.01 (${safe.toFixed(6)})`;
  return `$${safe.toFixed(2)}`;
}
