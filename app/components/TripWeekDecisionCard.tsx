"use client";

import { useState } from "react";
import type { TripWeekDecision } from "../lib/tripDecisionEngine";
import { scenarioLabel } from "../lib/tripWeekApproval";
import type {
  TripWeekApprovalState,
  TripWeekScenarioId,
} from "../lib/tripWeekApproval";

const STYLE_ID = "castlewatch-trip-decision-style";

export type TripWeekScenarioChange = {
  date: string;
  fromPark: string;
  toPark: string;
  reservations: {
    id: string;
    title: string;
    time: string;
    status: string;
  }[];
};

type Props = {
  decision: TripWeekDecision;
  approval: TripWeekApprovalState;
  changes: TripWeekScenarioChange[];
  onApplyScenario: (scenario: TripWeekScenarioId) => void;
  onUndo: () => void;
  onLockChange: (locked: boolean) => void;
};

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .trip-decision-card { border:1px solid rgba(56,217,150,.35); border-radius:17px; padding:13px; margin-bottom:14px; background:linear-gradient(135deg,rgba(56,217,150,.08),rgba(99,164,255,.05)); }
    .trip-decision-card-wait { border-color:rgba(255,184,76,.45); background:linear-gradient(135deg,rgba(255,184,76,.09),rgba(99,164,255,.04)); }
    .trip-decision-card-review { border-color:rgba(255,99,99,.42); background:linear-gradient(135deg,rgba(255,99,99,.08),rgba(99,164,255,.04)); }
    .trip-decision-heading { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
    .trip-decision-heading h3, .trip-decision-heading p { margin-top:0; }
    .trip-decision-status { border:1px solid rgba(56,217,150,.42); border-radius:999px; padding:4px 8px; font-size:10px; font-weight:900; white-space:nowrap; }
    .trip-decision-card-wait .trip-decision-status { border-color:rgba(255,184,76,.48); }
    .trip-decision-card-review .trip-decision-status { border-color:rgba(255,99,99,.48); }
    .trip-decision-summary { font-size:14px; line-height:1.4; margin-bottom:10px; }
    .trip-decision-current { border:1px solid rgba(99,164,255,.3); border-radius:11px; padding:8px 9px; margin-bottom:10px; background:rgba(99,164,255,.055); display:flex; justify-content:space-between; gap:10px; align-items:center; }
    .trip-decision-current strong { display:block; }
    .trip-decision-current span { color:var(--muted); font-size:11px; }
    .trip-decision-lock-badge { border:1px solid rgba(56,217,150,.38); border-radius:999px; padding:3px 7px; color:rgb(124,239,191) !important; font-size:9px !important; font-weight:900; white-space:nowrap; }
    .trip-decision-lock-badge-review { border-color:rgba(255,184,76,.48); color:rgb(255,201,116) !important; }
    .trip-decision-confidence { border:1px solid rgba(255,255,255,.11); border-radius:11px; padding:8px 9px; margin-bottom:10px; background:rgba(0,0,0,.08); }
    .trip-decision-confidence strong { display:block; margin-bottom:2px; }
    .trip-decision-score-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:10px 0; }
    .trip-decision-score { border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:9px; background:rgba(0,0,0,.09); }
    .trip-decision-score-preferred { border-color:rgba(56,217,150,.38); background:rgba(56,217,150,.055); }
    .trip-decision-score-active { box-shadow:inset 0 0 0 1px rgba(99,164,255,.34); }
    .trip-decision-score h4 { margin:0 0 4px; }
    .trip-decision-total { font-size:22px; font-weight:950; line-height:1; }
    .trip-decision-total span { font-size:10px; color:var(--muted); font-weight:800; }
    .trip-decision-breakdown { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; margin-top:8px; }
    .trip-decision-breakdown div { color:var(--muted); font-size:10px; }
    .trip-decision-breakdown strong { color:var(--text); }
    .trip-decision-blockers { border:1px solid rgba(255,184,76,.34); border-radius:11px; padding:8px 9px; background:rgba(255,184,76,.055); margin:9px 0; }
    .trip-decision-card-review .trip-decision-blockers { border-color:rgba(255,99,99,.36); background:rgba(255,99,99,.055); }
    .trip-decision-blockers strong { display:block; margin-bottom:4px; }
    .trip-decision-list { margin:4px 0 0; padding-left:18px; font-size:12px; line-height:1.4; }
    .trip-decision-actions { display:flex; flex-wrap:wrap; gap:7px; margin:11px 0 4px; }
    .trip-decision-button { border:1px solid rgba(255,255,255,.18); border-radius:10px; padding:8px 10px; background:rgba(255,255,255,.045); color:inherit; font:inherit; font-size:11px; font-weight:900; cursor:pointer; }
    .trip-decision-button-primary { border-color:rgba(56,217,150,.44); background:rgba(56,217,150,.11); }
    .trip-decision-button-warning { border-color:rgba(255,184,76,.42); background:rgba(255,184,76,.09); }
    .trip-decision-button-danger { border-color:rgba(255,99,99,.42); background:rgba(255,99,99,.08); }
    .trip-decision-lock-note { align-self:center; color:var(--muted); font-size:10px; line-height:1.35; }
    .trip-decision-confirm { border:1px solid rgba(99,164,255,.3); border-radius:12px; padding:10px; margin:10px 0; background:rgba(99,164,255,.055); }
    .trip-decision-confirm h4, .trip-decision-confirm p { margin-top:0; }
    .trip-decision-change { border-top:1px solid rgba(255,255,255,.09); padding:8px 0; }
    .trip-decision-change:first-of-type { border-top:0; }
    .trip-decision-change strong { display:block; }
    .trip-decision-change-reservations { margin-top:4px; color:var(--muted); font-size:11px; }
    .trip-decision-details { border-top:1px solid rgba(255,255,255,.1); margin-top:10px; padding-top:9px; }
    .trip-decision-details summary { cursor:pointer; font-weight:900; }
    .trip-decision-readiness { display:grid; gap:7px; margin-top:9px; }
    .trip-decision-readiness-row { border:1px solid rgba(255,255,255,.1); border-radius:10px; padding:8px; display:grid; grid-template-columns:auto 1fr; gap:8px; align-items:start; }
    .trip-decision-dot { width:9px; height:9px; border-radius:50%; margin-top:4px; background:rgba(255,255,255,.35); }
    .trip-decision-dot-ready { background:rgb(56,217,150); }
    .trip-decision-dot-watch { background:rgb(255,184,76); }
    .trip-decision-dot-pending { background:rgb(99,164,255); }
    .trip-decision-dot-blocked { background:rgb(255,99,99); }
    .trip-decision-readiness-row strong { display:block; font-size:12px; margin-bottom:2px; }
    .trip-decision-readiness-row span { color:var(--muted); font-size:11px; line-height:1.35; }
    @media (max-width:700px) {
      .trip-decision-score-grid { grid-template-columns:1fr; }
      .trip-decision-heading, .trip-decision-current { flex-direction:column; align-items:flex-start; }
      .trip-decision-actions { display:grid; grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(style);
}

function lockedNeedsReview(decision: TripWeekDecision, approval: TripWeekApprovalState) {
  return approval.locked && (
    decision.preferredScenario !== approval.activeScenario
    || decision.blockers.length > 0
    || decision.status === "wait"
    || decision.status === "review"
  );
}

function statusLabel(decision: TripWeekDecision, approval: TripWeekApprovalState) {
  if (lockedNeedsReview(decision, approval)) return "Locked · review needed";
  if (approval.locked) return "Park order locked";
  if (
    decision.preferredScenario === approval.activeScenario
    && (decision.status === "swap" || decision.status === "keep")
  ) return "Current plan matches";
  if (decision.status === "swap") return "Swap recommended";
  if (decision.status === "keep") return "Base plan recommended";
  if (decision.status === "review") return "Manual review";
  return "Wait for official data";
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function TripWeekDecisionCard({
  decision,
  approval,
  changes,
  onApplyScenario,
  onUndo,
  onLockChange,
}: Props) {
  ensureStyle();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);
  const [unlockConfirmOpen, setUnlockConfirmOpen] = useState(false);

  const recommendationMatchesActive = decision.preferredScenario === approval.activeScenario;
  const recommendationCanApply = !approval.locked
    && !recommendationMatchesActive
    && (decision.status === "swap" || decision.status === "keep");
  const canLock = !approval.locked
    && recommendationMatchesActive
    && decision.blockers.length === 0
    && (decision.status === "swap" || decision.status === "keep");
  const lockedReview = lockedNeedsReview(decision, approval);

  const headline = recommendationMatchesActive
    && (decision.status === "swap" || decision.status === "keep")
    ? `${scenarioLabel(approval.activeScenario)} is the lower-risk plan`
    : decision.headline;

  const summary = recommendationMatchesActive
    && (decision.status === "swap" || decision.status === "keep")
    ? `CastleWatch currently favors the active ${scenarioLabel(approval.activeScenario).toLowerCase()}. Continue monitoring official calendars and booking changes.`
    : decision.summary;

  function applyPreferredScenario() {
    onApplyScenario(decision.preferredScenario);
    setPreviewOpen(false);
  }

  function lockCurrentScenario() {
    if (!canLock) return;
    onLockChange(true);
    setLockConfirmOpen(false);
  }

  function unlockCurrentScenario() {
    onLockChange(false);
    setUnlockConfirmOpen(false);
  }

  return (
    <section className={`trip-decision-card trip-decision-card-${decision.status}`}>
      <div className="trip-decision-heading">
        <div>
          <h3>CastleWatch recommendation</h3>
          <p className="muted" style={{ marginBottom: 0 }}>Unified decision from events, bookings, resorts, transportation and historical signals.</p>
        </div>
        <span className="trip-decision-status">{statusLabel(decision, approval)}</span>
      </div>

      <h3 style={{ marginBottom: 5 }}>{headline}</h3>
      <div className="trip-decision-summary">{summary}</div>

      <div className="trip-decision-current">
        <div>
          <strong>Active park order: {scenarioLabel(approval.activeScenario)}</strong>
          <span>
            Saved on this device
            {approval.updatedAt ? ` · updated ${new Date(approval.updatedAt).toLocaleString()}` : ""}
            {approval.lockedAt ? ` · locked ${new Date(approval.lockedAt).toLocaleString()}` : ""}
          </span>
        </div>
        {approval.locked && (
          <span className={`trip-decision-lock-badge ${lockedReview ? "trip-decision-lock-badge-review" : ""}`}>
            {lockedReview ? "Review needed" : "Family-approved"}
          </span>
        )}
      </div>

      <div className="trip-decision-confidence">
        <strong>{decision.confidence} confidence</strong>
        <span className="muted">{decision.confidenceReason}</span>
      </div>

      <div className="trip-decision-score-grid">
        {(["base", "alternate"] as const).map((scenarioId) => {
          const scenario = decision.scenarios[scenarioId];
          const classes = [
            "trip-decision-score",
            decision.preferredScenario === scenarioId ? "trip-decision-score-preferred" : "",
            approval.activeScenario === scenarioId ? "trip-decision-score-active" : "",
          ].filter(Boolean).join(" ");
          return (
            <article className={classes} key={scenarioId}>
              <h4>
                {scenario.label}
                {approval.activeScenario === scenarioId ? " · Active" : ""}
                {decision.preferredScenario === scenarioId ? " · Lower risk" : ""}
              </h4>
              <div className="trip-decision-total">{scenario.score}<span> combined risk points</span></div>
              <div className="trip-decision-breakdown">
                <div>Events <strong>{scenario.eventRisk}</strong></div>
                <div>Reservations <strong>{scenario.reservationRisk}</strong></div>
                <div>Travel <strong>{scenario.resortTravelRisk}</strong></div>
                <div>Crowds <strong>{scenario.forecastRisk}</strong></div>
              </div>
            </article>
          );
        })}
      </div>

      {decision.blockers.length > 0 && (
        <div className="trip-decision-blockers">
          <strong>Why CastleWatch will not lock the week yet</strong>
          <ul className="trip-decision-list">
            {decision.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        </div>
      )}

      {lockedReview && (
        <div className="trip-decision-blockers">
          <strong>The locked park order needs a fresh family review</strong>
          <ul className="trip-decision-list">
            {!recommendationMatchesActive && <li>Current planning data now favors {scenarioLabel(decision.preferredScenario)}.</li>}
            {decision.blockers.length > 0 && <li>One or more lock blockers appeared after this order was approved.</li>}
            {(decision.status === "wait" || decision.status === "review") && <li>CastleWatch no longer has enough certainty to treat the locked order as final.</li>}
            <li>Unlock the park order before applying or undoing a change.</li>
          </ul>
        </div>
      )}

      <div className="trip-decision-actions">
        {recommendationCanApply && (
          <button className="trip-decision-button trip-decision-button-primary" type="button" onClick={() => setPreviewOpen((open) => !open)}>
            Review recommended change
          </button>
        )}
        {!approval.locked && approval.previousScenario && (
          <button className="trip-decision-button" type="button" onClick={onUndo}>
            Undo last park-order change
          </button>
        )}
        {canLock && (
          <button className="trip-decision-button trip-decision-button-warning" type="button" onClick={() => setLockConfirmOpen(true)}>
            Lock current park order
          </button>
        )}
        {!approval.locked && !canLock && (
          <span className="trip-decision-lock-note">Locking becomes available when the active order matches an actionable recommendation and all blockers are cleared.</span>
        )}
        {approval.locked && (
          <button className="trip-decision-button trip-decision-button-danger" type="button" onClick={() => setUnlockConfirmOpen(true)}>
            Unlock park order
          </button>
        )}
      </div>

      {previewOpen && recommendationCanApply && (
        <div className="trip-decision-confirm">
          <h4>Preview the change before applying</h4>
          <p className="muted">This changes only the active park order. Existing reservations and resort nights stay in place and are rechecked against the new order.</p>
          {changes.length ? changes.map((change) => (
            <div className="trip-decision-change" key={change.date}>
              <strong>{formatDate(change.date)}: {change.fromPark} → {change.toPark}</strong>
              <div className="trip-decision-change-reservations">
                {change.reservations.length
                  ? `${change.reservations.length} reservation${change.reservations.length === 1 ? "" : "s"} on this date: ${change.reservations.map((reservation) => `${reservation.time} ${reservation.title} (${reservation.status})`).join(", ")}`
                  : "No saved reservations on this date."}
              </div>
            </div>
          )) : <p className="muted">No dated park assignments would change.</p>}
          <div className="trip-decision-actions">
            <button className="trip-decision-button trip-decision-button-primary" type="button" onClick={applyPreferredScenario}>
              Apply {scenarioLabel(decision.preferredScenario)}
            </button>
            <button className="trip-decision-button" type="button" onClick={() => setPreviewOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {lockConfirmOpen && canLock && (
        <div className="trip-decision-confirm">
          <h4>Lock {scenarioLabel(approval.activeScenario)}?</h4>
          <p className="muted">Locking marks this park order as family-approved and prevents apply or undo actions until it is explicitly unlocked. Reservations and resort selections remain editable.</p>
          <div className="trip-decision-actions">
            <button className="trip-decision-button trip-decision-button-primary" type="button" onClick={lockCurrentScenario}>Confirm lock</button>
            <button className="trip-decision-button" type="button" onClick={() => setLockConfirmOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {unlockConfirmOpen && approval.locked && (
        <div className="trip-decision-confirm">
          <h4>Unlock the family-approved park order?</h4>
          <p className="muted">Unlocking allows a recommendation or undo action to change the active park order again.</p>
          <div className="trip-decision-actions">
            <button className="trip-decision-button trip-decision-button-danger" type="button" onClick={unlockCurrentScenario}>Confirm unlock</button>
            <button className="trip-decision-button" type="button" onClick={() => setUnlockConfirmOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div>
        <strong>Next actions</strong>
        <ol className="trip-decision-list">
          {decision.nextActions.map((action) => <li key={action}>{action}</li>)}
        </ol>
      </div>

      <details className="trip-decision-details">
        <summary>Why this scenario scored better</summary>
        {decision.keyReasons.length ? (
          <ul className="trip-decision-list">
            {decision.keyReasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        ) : (
          <p className="muted">No scenario-specific advantage is strong enough yet.</p>
        )}
      </details>

      <details className="trip-decision-details">
        <summary>Planning-input readiness</summary>
        <div className="trip-decision-readiness">
          {decision.readiness.map((item) => (
            <div className="trip-decision-readiness-row" key={item.id}>
              <span className={`trip-decision-dot trip-decision-dot-${item.status}`} aria-hidden="true" />
              <div><strong>{item.label}</strong><span>{item.detail}</span></div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
