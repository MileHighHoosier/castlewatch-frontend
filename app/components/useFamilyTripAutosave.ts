"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FamilyTripDocument,
  FamilyTripPayload,
  FamilyTripSyncAnalysis,
  FamilyTripSyncError,
  FamilyTripSyncMetadata,
  analyzeFamilyTripSync,
  buildLocalFamilyTripPayload,
  createFamilySyncMetadata,
  fetchFamilyTrip,
  fingerprintFamilyTripPayload,
  loadFamilySyncMetadata,
  saveFamilySyncMetadata,
  saveFamilyTrip,
} from "../lib/familyTripSync";
import {
  FamilyTripAuthorization,
  canWriteFamilyTrip,
} from "../lib/familyTripAuthorization";

const ENABLED_KEY = "castlewatch.family-autosave-enabled.v1";
const DEBOUNCE_MS = 6_000;
const MIN_INTERVAL_MS = 15_000;
const RETRIES = [5_000, 15_000, 30_000];
export const FAMILY_SYNC_UPDATED_EVENT = "castlewatch-family-sync-updated";

export type AutosavePhase = "off" | "ready" | "pending" | "saving" | "saved" | "retrying" | "blocked" | "failed";

type Props = {
  connected: boolean;
  authorization: FamilyTripAuthorization | null;
  localPayload: FamilyTripPayload | null;
  remote: FamilyTripDocument | null;
  analysis: FamilyTripSyncAnalysis | null;
  suspended: boolean;
  onSyncState: (remote: FamilyTripDocument, payload: FamilyTripPayload, metadata: FamilyTripSyncMetadata | null) => void;
};

function matchingMetadata(remote: FamilyTripDocument, payload: FamilyTripPayload) {
  const existing = loadFamilySyncMetadata();
  if (!remote.payload) return existing;
  if (fingerprintFamilyTripPayload(remote.payload) !== fingerprintFamilyTripPayload(payload)) return existing;
  const next = createFamilySyncMetadata(remote.version, remote.payload);
  saveFamilySyncMetadata(next);
  return next;
}

function blockedMessage(analysis: FamilyTripSyncAnalysis) {
  if (analysis.id === "remote_changes") return "A newer shared version exists. Download it before autosave can continue.";
  if (analysis.id === "conflict") return "This browser and the shared plan both changed. Autosave is blocked until the conflict is resolved.";
  if (analysis.id === "baseline_required") return "Autosave cannot choose a baseline. Select the local or shared copy manually first.";
  if (analysis.id === "remote_empty") return "Create the first shared plan manually before enabling autosave.";
  return analysis.detail;
}

function isRetryable(error: unknown) {
  if (error instanceof FamilyTripSyncError) {
    return error.statusCode === 408 || error.statusCode === 429 || error.statusCode >= 500;
  }
  return error instanceof Error;
}

export default function useFamilyTripAutosave({
  connected,
  authorization,
  localPayload,
  remote,
  analysis,
  suspended,
  onSyncState,
}: Props) {
  const [enabled, setEnabledState] = useState(false);
  const [phase, setPhase] = useState<AutosavePhase>("off");
  const [detail, setDetail] = useState("Autosave is off on this browser. Manual sync remains available.");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [nextAttemptAt, setNextAttemptAt] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const retryCount = useRef(0);
  const lastSaveEpoch = useRef(0);
  const previousFingerprint = useRef("");
  const writable = Boolean(authorization && canWriteFamilyTrip(authorization));

  const fingerprint = useMemo(
    () => localPayload ? fingerprintFamilyTripPayload(localPayload) : "",
    [localPayload],
  );

  const clearTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setNextAttemptAt(null);
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    if (value) window.localStorage.setItem(ENABLED_KEY, "true");
    else window.localStorage.removeItem(ENABLED_KEY);
    setEnabledState(value);
    if (!value) {
      clearTimer();
      retryCount.current = 0;
      setPhase("off");
      setDetail("Autosave is off on this browser. Manual sync remains available.");
    }
  }, [clearTimer]);

  useEffect(() => {
    const stored = window.localStorage.getItem(ENABLED_KEY) === "true";
    setEnabledState(stored);
    if (stored) {
      setPhase("ready");
      setDetail("Guarded autosave is enabled and waiting for a safe local change.");
    }
  }, []);

  const schedule = useCallback((delay: number, nextPhase: AutosavePhase, message: string, task: () => void) => {
    clearTimer();
    setPhase(nextPhase);
    setDetail(message);
    setNextAttemptAt(new Date(Date.now() + delay).toISOString());
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setNextAttemptAt(null);
      task();
    }, delay);
  }, [clearTimer]);

  const run = useCallback(async () => {
    if (!enabled || !connected || !authorization || !writable || suspended || inFlight.current) return;
    inFlight.current = true;
    setPhase("saving");
    setDetail("Checking the server version before saving…");
    const payload = buildLocalFamilyTripPayload();

    try {
      const current = await fetchFamilyTrip(authorization);
      const currentMetadata = matchingMetadata(current, payload);
      const currentAnalysis = analyzeFamilyTripSync(payload, current, currentMetadata);
      onSyncState(current, payload, currentMetadata);

      if (currentAnalysis.id === "up_to_date") {
        retryCount.current = 0;
        setPhase("ready");
        setDetail("The shared plan already matches this browser. No autosave was needed.");
        return;
      }
      if (currentAnalysis.id !== "local_changes") {
        retryCount.current = 0;
        setPhase("blocked");
        setDetail(blockedMessage(currentAnalysis));
        return;
      }

      const saved = await saveFamilyTrip(authorization, current.version, payload);
      const savedMetadata = createFamilySyncMetadata(saved.version, payload);
      saveFamilySyncMetadata(savedMetadata);
      onSyncState(saved, payload, savedMetadata);
      retryCount.current = 0;
      lastSaveEpoch.current = Date.now();
      setLastSavedAt(new Date().toISOString());
      setPhase("saved");
      setDetail(`Autosaved as shared version ${saved.version}. A backup snapshot was created.`);
      window.dispatchEvent(new CustomEvent(FAMILY_SYNC_UPDATED_EVENT));
    } catch (error) {
      if (error instanceof FamilyTripSyncError && error.statusCode === 409 && error.document) {
        const latestPayload = buildLocalFamilyTripPayload();
        const latestMetadata = matchingMetadata(error.document, latestPayload);
        const latestAnalysis = analyzeFamilyTripSync(latestPayload, error.document, latestMetadata);
        onSyncState(error.document, latestPayload, latestMetadata);
        if (latestAnalysis.id === "up_to_date") {
          retryCount.current = 0;
          setPhase("ready");
          setDetail("The same changes were saved elsewhere. This browser is now up to date.");
          return;
        }
        retryCount.current = 0;
        setPhase("blocked");
        setDetail(blockedMessage(latestAnalysis));
        return;
      }

      if (isRetryable(error)) {
        const index = Math.min(retryCount.current, RETRIES.length - 1);
        const delay = RETRIES[index];
        retryCount.current += 1;
        schedule(delay, "retrying", `Shared storage could not be reached. The local copy is safe; retrying in ${delay / 1_000} seconds.`, () => void run());
      } else {
        retryCount.current = 0;
        setPhase("failed");
        setDetail(error instanceof Error ? `Autosave stopped: ${error.message}` : "Autosave was rejected. Review the sync status and use manual upload.");
      }
    } finally {
      inFlight.current = false;
    }
  }, [authorization, connected, enabled, onSyncState, schedule, suspended, writable]);

  useEffect(() => {
    clearTimer();
    if (!enabled) return;
    if (!connected || !authorization || !remote || !localPayload || !analysis) {
      setPhase("blocked");
      setDetail("Connect to the Shared Family Plan before autosave can run.");
      return;
    }
    if (!writable) {
      clearTimer();
      window.localStorage.removeItem(ENABLED_KEY);
      setEnabledState(false);
      setPhase("off");
      setDetail("Viewer access is read only. Manual download and history remain available.");
      return;
    }
    if (suspended) {
      setPhase("pending");
      setDetail("Autosave is waiting for the manual sync action to finish.");
      return;
    }
    if (fingerprint !== previousFingerprint.current) {
      previousFingerprint.current = fingerprint;
      retryCount.current = 0;
    }
    if (analysis.id === "local_changes") {
      const wait = Math.max(DEBOUNCE_MS, MIN_INTERVAL_MS - (Date.now() - lastSaveEpoch.current));
      schedule(wait, "pending", `Local changes detected. Saving after ${Math.ceil(wait / 1_000)} seconds without further edits.`, () => void run());
      return;
    }
    retryCount.current = 0;
    if (analysis.id === "up_to_date") {
      if (Date.now() - lastSaveEpoch.current < 5_000) return;
      setPhase("ready");
      setDetail("Guarded autosave is enabled. This browser is up to date and waiting for local changes.");
    } else {
      setPhase("blocked");
      setDetail(blockedMessage(analysis));
    }
  }, [analysis, authorization, clearTimer, connected, enabled, fingerprint, localPayload, remote, run, schedule, suspended, writable]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const label = phase === "off" ? "Autosave off"
    : phase === "ready" ? "Autosave ready"
      : phase === "pending" ? "Changes pending"
        : phase === "saving" ? "Saving…"
          : phase === "saved" ? "Saved"
            : phase === "retrying" ? "Retry scheduled"
              : phase === "blocked" ? "Autosave blocked"
                : "Autosave failed";

  return { enabled, phase, label, detail, lastSavedAt, nextAttemptAt, setEnabled };
}
