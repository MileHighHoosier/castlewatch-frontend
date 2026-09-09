"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookingRuleVerification,
  BookingTarget,
  BookingTargetPriority,
  BookingTargetType,
  BookingWindowOverride,
  BookingWindowRule,
  loadRawBookingTargets,
  saveBookingTargets,
  validBookingTargetCollection,
} from "../lib/bookingTargets";
import { buildBookingTimeline } from "../lib/bookingTargetTimeline";
import { subscribeDecisionClock } from "../lib/decisionClock";
import { tripDateKey } from "../lib/tripDate";

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

export default function BookingTargetPlanner() {
  const [targets, setTargets] = useState<BookingTarget[]>([]);
  const [todayDate, setTodayDate] = useState("");
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    const raw = loadRawBookingTargets();
    if (raw === undefined) {
      setTargets([]);
    } else if (validBookingTargetCollection(raw)) {
      setTargets(raw);
    } else {
      setStorageError("Stored booking-target data has an unsupported or malformed shape. Editing is paused so the original data cannot be overwritten.");
    }

    return subscribeDecisionClock((nowIso) => setTodayDate(tripDateKey(nowIso) || ""), window);
  }, []);

  const timeline = useMemo(() => buildBookingTimeline(targets, todayDate), [targets, todayDate]);

  function commit(next: BookingTarget[]) {
    const current = loadRawBookingTargets();
    if (current !== undefined && !validBookingTargetCollection(current)) {
      setStorageError("Stored booking-target data changed to an unsupported shape. Nothing was saved.");
      return;
    }
    try {
      saveBookingTargets(next);
      setTargets(next);
      setStorageError("");
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Booking-target changes could not be saved.");
    }
  }

  function addTarget(title: string, targetType: BookingTargetType) {
    commit([...targets, newTarget(title, targetType)]);
  }

  function updateTarget(id: string, patch: Partial<BookingTarget>) {
    commit(targets.map((target) => target.id === id ? { ...target, ...patch } : target));
  }

  function updateRule(id: string, change: (rule: BookingWindowRule) => BookingWindowRule) {
    const target = targets.find((row) => row.id === id);
    if (!target) return;
    updateTarget(id, { bookingRule: change(target.bookingRule || emptyRule()) });
  }

  function updateOverride(id: string, patch: Partial<BookingWindowOverride>) {
    const target = targets.find((row) => row.id === id);
    if (!target) return;
    const next = { openingDate: null, deadlineDate: null, note: "", ...target.manualOverride, ...patch };
    updateTarget(id, { manualOverride: next.openingDate || next.deadlineDate || next.note ? next : null });
  }

  return (
    <section className="card booking-planner">
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

      {storageError && <p className="booking-planner-error" role="alert">{storageError}</p>}

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
          return (
            <article className={`booking-target-card booking-target-${readiness.tone}`} key={target.id}>
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
                <span>Target state: {target.status}</span>
              </div>

              <details className="booking-target-editor">
                <summary>Edit planning details</summary>
                <div className="booking-target-form">
                  <label><span>Name</span><input value={target.title} onChange={(event) => updateTarget(target.id, { title: event.target.value || "Untitled target" })} /></label>
                  <label><span>Type</span><select value={target.targetType} onChange={(event) => updateTarget(target.id, { targetType: event.target.value as BookingTargetType })}><option value="dining">Dining</option><option value="experience">Experience</option><option value="tour">Tour</option><option value="other">Other</option></select></label>
                  <label><span>Priority</span><select value={target.priority} onChange={(event) => updateTarget(target.id, { priority: event.target.value as BookingTargetPriority })}><option value="must_do">Must do</option><option value="high">High</option><option value="standard">Standard</option><option value="low">Low</option></select></label>
                  <label><span>Desired trip date</span><input type="date" value={target.desiredTripDate} onChange={(event) => updateTarget(target.id, { desiredTripDate: event.target.value })} /></label>
                  <label><span>Rule verification</span><select value={rule?.verification || "needs_verification"} onChange={(event) => updateRule(target.id, (current) => ({ ...current, verification: event.target.value as BookingRuleVerification }))}><option value="needs_verification">Needs verification</option><option value="verified">Verified</option><option value="unavailable">Unavailable</option></select></label>
                  <label><span>Rule source</span><input placeholder="Official page or family research" value={rule?.provenance.source || ""} onChange={(event) => updateRule(target.id, (current) => ({ ...current, provenance: { ...current.provenance, source: event.target.value } }))} /></label>
                  <label><span>Source URL</span><input inputMode="url" placeholder="https://…" value={rule?.provenance.sourceUrl || ""} onChange={(event) => updateRule(target.id, (current) => ({ ...current, provenance: { ...current.provenance, sourceUrl: event.target.value || null } }))} /></label>
                  <label><span>Rule as-of date</span><input type="date" value={rule?.provenance.asOfDate || ""} onChange={(event) => updateRule(target.id, (current) => ({ ...current, provenance: { ...current.provenance, asOfDate: event.target.value || null } }))} /></label>
                  <label><span>Opening days before trip</span><input type="number" min="0" max="3660" value={rule?.openingDaysBeforeTrip ?? ""} onChange={(event) => updateRule(target.id, (current) => ({ ...current, openingDaysBeforeTrip: numericOffset(event.target.value) }))} /></label>
                  <label><span>Deadline days before trip</span><input type="number" min="0" max="3660" value={rule?.deadlineDaysBeforeTrip ?? ""} onChange={(event) => updateRule(target.id, (current) => ({ ...current, deadlineDaysBeforeTrip: numericOffset(event.target.value) }))} /></label>
                  <label><span>Manual opening date</span><input type="date" value={target.manualOverride?.openingDate || ""} onChange={(event) => updateOverride(target.id, { openingDate: event.target.value || null })} /></label>
                  <label><span>Manual deadline date</span><input type="date" value={target.manualOverride?.deadlineDate || ""} onChange={(event) => updateOverride(target.id, { deadlineDate: event.target.value || null })} /></label>
                  <label className="booking-target-wide"><span>Override note</span><input placeholder="Why the family chose these dates" value={target.manualOverride?.note || ""} onChange={(event) => updateOverride(target.id, { note: event.target.value })} /></label>
                  <label className="booking-target-wide"><span>Planning notes</span><textarea value={target.notes} onChange={(event) => updateTarget(target.id, { notes: event.target.value })} /></label>
                </div>
                <div className="booking-target-editor-actions">
                  <button type="button" onClick={() => updateTarget(target.id, { bookingRule: null })}>Clear rule</button>
                  <button type="button" onClick={() => updateTarget(target.id, { manualOverride: null })}>Clear overrides</button>
                  <button className="booking-target-remove" type="button" onClick={() => commit(targets.filter((row) => row.id !== target.id))}>Remove planning target</button>
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
