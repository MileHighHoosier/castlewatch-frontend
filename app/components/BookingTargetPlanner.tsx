"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookingRuleVerification,
  BookingTarget,
  BookingTargetPriority,
  BookingTargetType,
  BookingWindowOverride,
  BookingWindowRule,
  BOOKING_TARGETS_STORAGE_KEY,
  loadRawBookingTargets,
  updateBookingTargets,
  validBookingTargetCollection,
} from "../lib/bookingTargets";
import {
  BookingLifecycleAction,
  applyBookingLifecycleAction,
  summarizeBookingLifecycle,
} from "../lib/bookingTargetLifecycle";
import { buildBookingTimeline } from "../lib/bookingTargetTimeline";
import { subscribeDecisionClock } from "../lib/decisionClock";
import { tripDateKey } from "../lib/tripDate";
import { BOOKING_TARGETS_UPDATED_EVENT } from "../lib/bookingTargetWriteLock";
import {
  RESERVATION_STORAGE_KEY,
  TripReservation,
  loadRawReservations,
  validReservationCollection,
} from "../lib/tripProfile";

const TARGET_TEMPLATES: Array<{ title: string; targetType: BookingTargetType }> = [
  { title: "Bibbidi Bobbidi Boutique", targetType: "experience" },
  { title: "Cinderella's Royal Table", targetType: "dining" },
  { title: "1900 Park Fare", targetType: "dining" },
  { title: "Savi's Workshop – Handbuilt Lightsabers", targetType: "experience" },
  { title: "Walt Disney World tour", targetType: "tour" },
];

const PRIORITY_LABELS: Record<BookingTargetPriority, string> = {
  must_do: "Must do",
  high: "High",
  standard: "Standard",
  low: "Low",
};

const VERIFICATION_LABELS: Record<BookingRuleVerification, string> = {
  verified: "Verified",
  needs_verification: "Needs verification",
  unavailable: "Unavailable",
};

const STATUS_LABELS: Record<BookingTarget["status"], string> = {
  planned: "Planned",
  attempted: "Attempted",
  booked: "Booked",
  unavailable: "Unavailable",
  backup: "Backup selected",
};

type LifecycleDraft = {
  actionDate: string;
  attemptNote: string;
  fallbackTitle: string;
  fallbackNote: string;
  reservationId: string;
};

const EMPTY_LIFECYCLE_DRAFT: LifecycleDraft = {
  actionDate: "",
  attemptNote: "",
  fallbackTitle: "",
  fallbackNote: "",
  reservationId: "",
};

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newTarget(title: string, targetType: BookingTargetType): BookingTarget {
  return {
    id: newId(),
    title,
    targetType,
    priority: "standard",
    desiredTripDate: "",
    status: "planned",
    bookingRule: null,
    manualOverride: null,
    linkedReservationId: null,
    notes: "",
    attempts: [],
    fallbackChoice: null,
  };
}

function emptyRule(): BookingWindowRule {
  return {
    provenance: { source: "", sourceUrl: null, asOfDate: null },
    verification: "needs_verification",
    openingDaysBeforeTrip: null,
    deadlineDaysBeforeTrip: null,
  };
}

function numericOffset(value: string) {
  if (!value) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 3660 ? number : null;
}

function displayDate(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

function safeSourceUrl(value: string | null) {
  return value && /^https?:\/\//i.test(value) ? value : null;
}

// Capture the primitive while the event is current; a queued lock must never
// read a later value from the mutable input element.
function inputValue(change: (value: string) => void) {
  return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => change(event.currentTarget.value);
}

export default function BookingTargetPlanner() {
  const [targets, setTargets] = useState<BookingTarget[]>([]);
  const [todayDate, setTodayDate] = useState("");
  const [storageError, setStorageError] = useState("");
  const [reservations, setReservations] = useState<TripReservation[]>([]);
  const [reservationError, setReservationError] = useState("");
  const [lifecycleDrafts, setLifecycleDrafts] = useState<Record<string, LifecycleDraft>>({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const pendingWrites = useRef(0);
  const mounted = useRef(false);

  const refreshTargets = useCallback(() => {
    if (pendingWrites.current > 0) return;
    const raw = loadRawBookingTargets();
    if (raw === undefined) {
      setTargets([]);
    } else if (validBookingTargetCollection(raw)) {
      setTargets(raw);
    } else {
      setTargets([]);
      setStorageError("Stored booking-target data has an unsupported or malformed shape. Editing is paused so the original data cannot be overwritten.");
      return;
    }
    setStorageError("");
  }, []);

  const refreshReservations = useCallback(() => {
    const raw = loadRawReservations();
    if (!validReservationCollection(raw)) {
      setReservations([]);
      setReservationError("Stored reservations are malformed or unsupported. Booking links are paused so the reservation data stays unchanged.");
      return;
    }
    setReservations(raw);
    setReservationError("");
  }, []);

  useEffect(() => {
    mounted.current = true;
    refreshTargets();
    refreshReservations();
    const onStorage = (event: StorageEvent) => {
      if (event.key === BOOKING_TARGETS_STORAGE_KEY || event.key === null) refreshTargets();
      if (event.key === RESERVATION_STORAGE_KEY || event.key === null) refreshReservations();
    };
    const onFocus = () => {
      refreshTargets();
      refreshReservations();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    window.addEventListener(BOOKING_TARGETS_UPDATED_EVENT, refreshTargets);
    const stopClock = subscribeDecisionClock((nowIso) => setTodayDate(tripDateKey(nowIso) || ""), window);
    return () => {
      mounted.current = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(BOOKING_TARGETS_UPDATED_EVENT, refreshTargets);
      stopClock();
    };
  }, [refreshReservations, refreshTargets]);

  const timeline = useMemo(() => buildBookingTimeline(targets, todayDate), [targets, todayDate]);

  async function commit(change: (current: BookingTarget[]) => BookingTarget[], optimistic = true) {
    if (storageError) return;
    pendingWrites.current += 1;
    setSaving(true);
    setSaveError("");
    // Keep typing responsive while persistence waits. This is only a UI draft;
    // the write callback is separately applied to storage under the lock.
    if (optimistic) setTargets(change);
    try {
      await updateBookingTargets(change);
    } catch (error) {
      if (mounted.current) setSaveError(error instanceof Error ? error.message : "Booking-target changes could not be saved.");
    } finally {
      pendingWrites.current -= 1;
      if (mounted.current && pendingWrites.current === 0) {
        setSaving(false);
        refreshTargets();
      }
    }
  }

  function addTarget(title: string, targetType: BookingTargetType) {
    const target = newTarget(title, targetType);
    void commit((current) => [...current, target]);
  }

  function updateTarget(id: string, change: (target: BookingTarget) => Partial<BookingTarget>) {
    void commit((current) => current.map((target) => target.id === id ? { ...target, ...change(target) } : target));
  }

  function updateRule(id: string, change: (rule: BookingWindowRule) => BookingWindowRule) {
    updateTarget(id, (target) => ({ bookingRule: change(target.bookingRule || emptyRule()) }));
  }

  function updateOverride(id: string, patch: Partial<BookingWindowOverride>) {
    updateTarget(id, (target) => {
      const next = { openingDate: null, deadlineDate: null, note: "", ...target.manualOverride, ...patch };
      return { manualOverride: next.openingDate || next.deadlineDate || next.note ? next : null };
    });
  }

  function lifecycleDraft(id: string) {
    return lifecycleDrafts[id] || EMPTY_LIFECYCLE_DRAFT;
  }

  function updateLifecycleDraft(id: string, patch: Partial<LifecycleDraft>) {
    setLifecycleDrafts((current) => ({
      ...current,
      [id]: { ...EMPTY_LIFECYCLE_DRAFT, ...current[id], ...patch },
    }));
  }

  function lifecycleAction(id: string, action: BookingLifecycleAction) {
    void commit((current) => {
      const target = current.find((row) => row.id === id);
      if (!target) throw new Error("That booking target no longer exists. No lifecycle change was saved.");

      let currentReservations = reservations;
      if (action.type === "link_booked") {
        const rawReservations = loadRawReservations();
        if (!validReservationCollection(rawReservations)) {
          throw new Error("Stored reservations changed to an unsupported shape. No booking link was saved.");
        }
        currentReservations = rawReservations;
      }
      const next = applyBookingLifecycleAction(target, action, currentReservations);
      return current.map((row) => row.id === id ? next : row);
    }, false);
  }

  return (
    <section className="card booking-planner" aria-busy={saving}>
      <header className="booking-planner-header">
        <div>
          <h2>Reservation Window Planner</h2>
          <p className="muted">Prioritize booking targets and review planning dates. Targets never create or change reservations or your itinerary.</p>
        </div>
        <span className="booking-planner-today">Planning date<br /><strong>{todayDate || "Checking…"}</strong></span>
      </header>

      <aside className="booking-planner-safety">
        <strong>Verify before relying on a date</strong>
        <span>CastleWatch does not assume an official booking policy. Add the source, as-of date and offsets you have verified, or enter a clearly labeled family override.</span>
      </aside>

      <aside className="booking-planner-impact">
        <strong>Lifecycle changes stay in the planner</strong>
        <span>Recording an attempt, an unavailable result or a backup choice does not claim live availability and does not change reservations or Trip Week. Linking a booked target only points to a reservation you already created deliberately; that reservation remains the source for timing, transportation, conflicts and Trip Week effects.</span>
      </aside>

      {storageError && <p className="booking-planner-error" role="alert">{storageError}</p>}
      {reservationError && <p className="booking-planner-error" role="alert">{reservationError}</p>}
      {saveError && <p className="booking-planner-error" role="alert">{saveError}</p>}
      {saving && <p className="muted" role="status">Saving planning changes…</p>}

      <div className="booking-planner-add" aria-label="Add a booking target">
        {TARGET_TEMPLATES.map((template) => (
          <button key={template.title} type="button" disabled={Boolean(storageError)} onClick={() => addTarget(template.title, template.targetType)}>
            + {template.title}
          </button>
        ))}
        <button type="button" disabled={Boolean(storageError)} onClick={() => addTarget("New booking target", "other")}>+ Custom target</button>
      </div>

      {timeline.length === 0 && !storageError && (
        <div className="booking-planner-empty">No booking targets yet. Add a named priority or a custom target above.</div>
      )}

      <div className="booking-timeline">
        {timeline.map(({ target, window, readiness }) => {
          const rule = target.bookingRule;
          const sourceUrl = safeSourceUrl(rule?.provenance.sourceUrl || null);
          const draft = lifecycleDraft(target.id);
          const actionDate = draft.actionDate || todayDate;
          const lifecycle = summarizeBookingLifecycle(target, reservations);
          const attempts = target.attempts || [];
          return (
            <article className={`booking-target-card booking-target-${readiness.tone}`} key={target.id} data-target-id={target.id}>
              <div className="booking-target-top">
                <div>
                  <div className="booking-target-kicker">{PRIORITY_LABELS[target.priority]} priority · {target.targetType}</div>
                  <h3>{target.title}</h3>
                </div>
                <span className={`booking-readiness booking-readiness-${readiness.tone}`}>{readiness.label}</span>
              </div>

              <div className="booking-window-grid">
                <div>
                  <span>Opening</span>
                  <strong>{displayDate(window.opening.date)}</strong>
                  <small>{window.opening.source === "manual_override" ? "Family override" : window.opening.detail}</small>
                </div>
                <div>
                  <span>Deadline</span>
                  <strong>{displayDate(window.deadline.date)}</strong>
                  <small>{window.deadline.source === "manual_override" ? "Family override" : window.deadline.detail}</small>
                </div>
              </div>

              <p className="booking-readiness-detail">{readiness.detail}</p>
              {target.manualOverride?.note && <p className="booking-override-note"><strong>Family override note:</strong> {target.manualOverride.note}</p>}
              <div className="booking-rule-summary">
                <span>{rule ? VERIFICATION_LABELS[rule.verification] : "No rule entered"}</span>
                <span>{rule?.provenance.source ? <>Source: {sourceUrl ? <a href={sourceUrl} rel="noreferrer" target="_blank">{rule.provenance.source}</a> : rule.provenance.source}</> : "Source needed"}</span>
                <span>As of: {rule?.provenance.asOfDate || "not entered"}</span>
                <span>Target state: {STATUS_LABELS[target.status]}</span>
              </div>

              <details className="booking-lifecycle">
                <summary>Attempt &amp; contingency workflow</summary>
                <p className="booking-lifecycle-boundary">Every action below updates this booking target only. It never creates, confirms, edits or deletes a reservation and never changes the itinerary.</p>
                {lifecycle.warning && <p className="booking-lifecycle-warning" role="alert">{lifecycle.warning}</p>}
                {lifecycle.linkedReservationTitle && (
                  <p className="booking-lifecycle-linked"><strong>Linked reservation:</strong> {lifecycle.linkedReservationTitle}</p>
                )}
                {target.fallbackChoice && (
                  <p className="booking-lifecycle-fallback"><strong>Selected backup:</strong> {target.fallbackChoice.title} · {target.fallbackChoice.selectedOn}{target.fallbackChoice.note ? ` · ${target.fallbackChoice.note}` : ""}</p>
                )}
                {attempts.length > 0 && (
                  <ol className="booking-attempt-list" aria-label="Recorded attempts">
                    {attempts.map((attempt) => (
                      <li key={attempt.id}><strong>{STATUS_LABELS[attempt.result]}</strong> · {attempt.attemptedOn}{attempt.note ? ` · ${attempt.note}` : ""}</li>
                    ))}
                  </ol>
                )}

                <div className="booking-lifecycle-form">
                  <label><span>Action date</span><input type="date" value={actionDate} onChange={inputValue((value) => updateLifecycleDraft(target.id, { actionDate: value }))} /></label>
                  <label><span>Attempt/result note</span><input placeholder="What happened?" value={draft.attemptNote} onChange={inputValue((value) => updateLifecycleDraft(target.id, { attemptNote: value }))} /></label>
                  <div className="booking-lifecycle-actions booking-target-wide">
                    <button type="button" disabled={Boolean(target.linkedReservationId)} onClick={() => lifecycleAction(target.id, { type: "record_attempt", attemptId: newId(), attemptedOn: actionDate, note: draft.attemptNote })}>Record attempt</button>
                    <button type="button" disabled={Boolean(target.linkedReservationId)} onClick={() => lifecycleAction(target.id, { type: "mark_unavailable", attemptId: newId(), attemptedOn: actionDate, note: draft.attemptNote })}>Record unavailable result</button>
                    {target.status !== "planned" && !target.linkedReservationId && <button type="button" onClick={() => lifecycleAction(target.id, { type: "return_to_planned" })}>Return to planned</button>}
                  </div>

                  <label><span>Backup choice</span><input placeholder="Family-selected alternative" value={draft.fallbackTitle} onChange={inputValue((value) => updateLifecycleDraft(target.id, { fallbackTitle: value }))} /></label>
                  <label><span>Backup note</span><input placeholder="Why this fallback?" value={draft.fallbackNote} onChange={inputValue((value) => updateLifecycleDraft(target.id, { fallbackNote: value }))} /></label>
                  <div className="booking-lifecycle-actions booking-target-wide">
                    <button type="button" disabled={Boolean(target.linkedReservationId)} onClick={() => lifecycleAction(target.id, { type: "choose_backup", selectedOn: actionDate, title: draft.fallbackTitle, note: draft.fallbackNote })}>Select this backup</button>
                  </div>

                  <label className="booking-target-wide"><span>Existing reservation to link</span>
                    <select value={draft.reservationId} disabled={Boolean(reservationError) || Boolean(target.linkedReservationId)} onChange={inputValue((value) => updateLifecycleDraft(target.id, { reservationId: value }))}>
                      <option value="">Select an existing reservation</option>
                      {reservations.map((reservation) => <option key={reservation.id} value={reservation.id}>{reservation.title} · {reservation.date} · {reservation.status}</option>)}
                    </select>
                  </label>
                  <p className="booking-lifecycle-reservation-help booking-target-wide">Create or edit reservations deliberately in Trip Week. The planner only links to an existing record and does not change its details or confirmation state.</p>
                  <div className="booking-lifecycle-actions booking-target-wide">
                    {target.linkedReservationId ? (
                      <button type="button" onClick={() => lifecycleAction(target.id, { type: "unlink_booking" })}>Unlink booking and return to attempted</button>
                    ) : (
                      <button type="button" disabled={Boolean(reservationError)} onClick={() => lifecycleAction(target.id, { type: "link_booked", attemptId: newId(), attemptedOn: actionDate, note: draft.attemptNote, reservationId: draft.reservationId })}>Link reservation &amp; mark booked</button>
                    )}
                  </div>
                </div>
              </details>

              <details className="booking-target-editor">
                <summary>Edit planning details</summary>
                <div className="booking-target-form">
                  <label><span>Name</span><input value={target.title} onChange={inputValue((value) => updateTarget(target.id, () => ({ title: value || "Untitled target" })))} /></label>
                  <label><span>Type</span><select value={target.targetType} onChange={inputValue((value) => updateTarget(target.id, () => ({ targetType: value as BookingTargetType })))}><option value="dining">Dining</option><option value="experience">Experience</option><option value="tour">Tour</option><option value="other">Other</option></select></label>
                  <label><span>Priority</span><select value={target.priority} onChange={inputValue((value) => updateTarget(target.id, () => ({ priority: value as BookingTargetPriority })))}><option value="must_do">Must do</option><option value="high">High</option><option value="standard">Standard</option><option value="low">Low</option></select></label>
                  <label><span>Desired trip date</span><input type="date" value={target.desiredTripDate} onChange={inputValue((value) => updateTarget(target.id, () => ({ desiredTripDate: value })))} /></label>
                  <label><span>Rule verification</span><select value={rule?.verification || "needs_verification"} onChange={inputValue((value) => updateRule(target.id, (current) => ({ ...current, verification: value as BookingRuleVerification })))}><option value="needs_verification">Needs verification</option><option value="verified">Verified</option><option value="unavailable">Unavailable</option></select></label>
                  <label><span>Rule source</span><input placeholder="Official page or family research" value={rule?.provenance.source || ""} onChange={inputValue((value) => updateRule(target.id, (current) => ({ ...current, provenance: { ...current.provenance, source: value } })))} /></label>
                  <label><span>Source URL</span><input inputMode="url" placeholder="https://…" value={rule?.provenance.sourceUrl || ""} onChange={inputValue((value) => updateRule(target.id, (current) => ({ ...current, provenance: { ...current.provenance, sourceUrl: value || null } })))} /></label>
                  <label><span>Rule as-of date</span><input type="date" value={rule?.provenance.asOfDate || ""} onChange={inputValue((value) => updateRule(target.id, (current) => ({ ...current, provenance: { ...current.provenance, asOfDate: value || null } })))} /></label>
                  <label><span>Opening days before trip</span><input type="number" min="0" max="3660" value={rule?.openingDaysBeforeTrip ?? ""} onChange={inputValue((value) => updateRule(target.id, (current) => ({ ...current, openingDaysBeforeTrip: numericOffset(value) })))} /></label>
                  <label><span>Deadline days before trip</span><input type="number" min="0" max="3660" value={rule?.deadlineDaysBeforeTrip ?? ""} onChange={inputValue((value) => updateRule(target.id, (current) => ({ ...current, deadlineDaysBeforeTrip: numericOffset(value) })))} /></label>
                  <label><span>Manual opening date</span><input type="date" value={target.manualOverride?.openingDate || ""} onChange={inputValue((value) => updateOverride(target.id, { openingDate: value || null }))} /></label>
                  <label><span>Manual deadline date</span><input type="date" value={target.manualOverride?.deadlineDate || ""} onChange={inputValue((value) => updateOverride(target.id, { deadlineDate: value || null }))} /></label>
                  <label className="booking-target-wide"><span>Override note</span><input placeholder="Why the family chose these dates" value={target.manualOverride?.note || ""} onChange={inputValue((value) => updateOverride(target.id, { note: value }))} /></label>
                  <label className="booking-target-wide"><span>Planning notes</span><textarea value={target.notes} onChange={inputValue((value) => updateTarget(target.id, () => ({ notes: value })))} /></label>
                </div>
                <div className="booking-target-editor-actions">
                  <button type="button" onClick={() => updateTarget(target.id, () => ({ bookingRule: null }))}>Clear rule</button>
                  <button type="button" onClick={() => updateTarget(target.id, () => ({ manualOverride: null }))}>Clear overrides</button>
                  <button className="booking-target-remove" type="button" onClick={() => commit((current) => current.filter((row) => row.id !== target.id))}>Remove planning target</button>
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
