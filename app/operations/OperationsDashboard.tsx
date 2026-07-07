"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FamilyTripOperationsReport,
  fetchFamilyTripOperations,
  formatOperationsBytes,
  formatOperationsCost,
} from "../lib/familyTripOperations";
import { loadFamilyKey } from "../lib/familyTripSync";
import styles from "./operations.module.css";

function count(value: number | null) {
  return value === null ? "Not available" : Math.round(value).toLocaleString();
}

function reliability(value: string) {
  if (value === "limited_by_retention") return "Limited by retained history";
  if (value === "moderate") return "Moderate confidence";
  return "Early estimate";
}

export default function OperationsDashboard() {
  const savedKey = useRef("");
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<FamilyTripOperationsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (providedKey?: string) => {
    const key = (providedKey || savedKey.current).trim();
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchFamilyTripOperations(key));
    } catch (value) {
      setReport(null);
      setError(value instanceof Error ? value.message : "The operations report could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    savedKey.current = loadFamilyKey();
    setChecked(true);
    if (savedKey.current) void refresh(savedKey.current);
  }, [refresh]);

  return (
    <main className={`page ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <Link className={styles.backLink} href="/">← Back to CastleWatch</Link>
          <div className={styles.titleRow}>
            <h1>Operations &amp; Cost</h1>
            <span>Read only</span>
          </div>
          <p>Storage, activity, and estimated Railway cost for the Shared Family Plan.</p>
        </div>
        <button type="button" disabled={loading || !savedKey.current} onClick={() => void refresh()}>
          {loading ? "Refreshing…" : "Refresh report"}
        </button>
      </header>

      {!checked && <section className={styles.notice}>Checking this browser for a Shared Family Plan connection…</section>}

      {checked && !savedKey.current && (
        <section className={styles.notice}>
          <h2>No Shared Family Plan connection found</h2>
          <p>Connect this browser from the main dashboard, then return here.</p>
          <Link href="/">Return to the dashboard</Link>
        </section>
      )}

      {error && (
        <section className={`${styles.notice} ${styles.error}`}>
          <h2>Operations report unavailable</h2>
          <p>{error}</p>
          <button type="button" onClick={() => void refresh()}>Try again</button>
        </section>
      )}

      {report && (
        <>
          <section className={styles.status}>
            <div>
              <strong>{report.warnings.length ? "Review operations notices" : "Operations look normal"}</strong>
              <span>Shared version {report.storage.currentVersion} · generated {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : "now"}</span>
            </div>
            <span>{report.warnings.length} notices</span>
          </section>

          <section className={styles.metrics}>
            <article><span>Shared plan</span><strong>{formatOperationsBytes(report.storage.currentPayloadBytes)}</strong><small>{report.storage.payloadLimitUsedPercent.toFixed(2)}% of limit</small></article>
            <article><span>Backups retained</span><strong>{report.storage.retainedHistoryCount} / {report.storage.historyLimit}</strong><small>{formatOperationsBytes(report.storage.retainedHistoryBytes)}</small></article>
            <article><span>Versions in 24 hours</span><strong>{report.activity.versionsCreatedLast24Hours}</strong><small>{report.activity.versionsCreatedLast7Days} in seven days</small></article>
            <article><span>{report.monthlyProjection.projectionDays}-day estimate</span><strong>{formatOperationsCost(report.monthlyProjection.illustrativeFamilyRailwayEgressUsd)}</strong><small>{formatOperationsBytes(report.monthlyProjection.illustrativeFamilyRailwayEgressBytes)} egress</small></article>
          </section>

          <div className={styles.twoColumn}>
            <section className={styles.panel}>
              <h2>30-day projection</h2>
              <p className={styles.subtle}>{reliability(report.monthlyProjection.reliability)}</p>
              <dl>
                <div><dt>Observed version rate</dt><dd>{report.monthlyProjection.observedDailyVersionRate.toFixed(2)} / day</dd></div>
                <div><dt>Projected autosaves</dt><dd>{count(report.monthlyProjection.projectedGuardedAutosaves)}</dd></div>
                <div><dt>Illustrative reads</dt><dd>{count(report.monthlyProjection.illustrativeFamilyReadChecks)}</dd></div>
                <div><dt>Projected egress</dt><dd>{formatOperationsBytes(report.monthlyProjection.illustrativeFamilyRailwayEgressBytes)}</dd></div>
              </dl>
              <p className={styles.note}>{report.monthlyProjection.note}</p>
            </section>

            <section className={styles.panel}>
              <h2>Per-operation estimates</h2>
              <p className={styles.subtle}>Railway network egress only</p>
              <dl>
                <div><dt>Full read</dt><dd>{formatOperationsBytes(report.transferEstimates.estimatedRailwayEgressBytesPerFullRead)}</dd></div>
                <div><dt>Read cost</dt><dd>{formatOperationsCost(report.costEstimates.estimatedRailwayEgressUsdPerFullRead)}</dd></div>
                <div><dt>Guarded autosave</dt><dd>{formatOperationsBytes(report.transferEstimates.estimatedRailwayEgressBytesPerGuardedAutosave)}</dd></div>
                <div><dt>Autosave cost</dt><dd>{formatOperationsCost(report.costEstimates.estimatedRailwayEgressUsdPerGuardedAutosave)}</dd></div>
                <div><dt>Reads per $1</dt><dd>{count(report.costEstimates.estimatedFullReadsPerRailwayEgressDollar)}</dd></div>
                <div><dt>Autosaves per $1</dt><dd>{count(report.costEstimates.estimatedGuardedAutosavesPerRailwayEgressDollar)}</dd></div>
              </dl>
            </section>
          </div>

          <section className={styles.panel}>
            <h2>Warnings &amp; controls</h2>
            {report.warnings.length ? (
              <div className={styles.warningList}>{report.warnings.map((warning) => <p key={warning.code}><strong>{warning.level}:</strong> {warning.message}</p>)}</div>
            ) : <p className={styles.good}>No operations warnings are active.</p>}
            <dl>
              <div><dt>Read-only report</dt><dd>{report.controls.readOnlyReport ? "Yes" : "No"}</dd></div>
              <div><dt>Telemetry rows written</dt><dd>{report.controls.telemetryRowsWritten ? "Yes" : "No"}</dd></div>
              <div><dt>Warning threshold</dt><dd>{formatOperationsBytes(report.controls.monthlyEgressWarningBytes)}</dd></div>
              <div><dt>Critical threshold</dt><dd>{formatOperationsBytes(report.controls.monthlyEgressCriticalBytes)}</dd></div>
              <div><dt>History storage estimate</dt><dd>{formatOperationsCost(report.costEstimates.estimatedRailwayVolumeUsdPerMonthAtHistoryLimit)}</dd></div>
              <div><dt>Pricing reviewed</dt><dd>{report.pricingAssumptions.reviewedAt || "Not available"}</dd></div>
            </dl>
            <p className={styles.note}>{report.costEstimates.note}</p>
          </section>
        </>
      )}
    </main>
  );
}
