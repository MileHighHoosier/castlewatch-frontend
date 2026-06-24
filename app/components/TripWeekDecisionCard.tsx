"use client";

import type { TripWeekDecision } from "../lib/tripDecisionEngine";

const STYLE_ID = "castlewatch-trip-decision-style";

type Props = {
  decision: TripWeekDecision;
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
    .trip-decision-confidence { border:1px solid rgba(255,255,255,.11); border-radius:11px; padding:8px 9px; margin-bottom:10px; background:rgba(0,0,0,.08); }
    .trip-decision-confidence strong { display:block; margin-bottom:2px; }
    .trip-decision-score-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:10px 0; }
    .trip-decision-score { border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:9px; background:rgba(0,0,0,.09); }
    .trip-decision-score-preferred { border-color:rgba(56,217,150,.38); background:rgba(56,217,150,.055); }
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
      .trip-decision-heading { flex-direction:column; }
    }
  `;
  document.head.appendChild(style);
}

function statusLabel(status: TripWeekDecision["status"]) {
  if (status === "swap") return "Swap recommended";
  if (status === "keep") return "Keep current order";
  if (status === "review") return "Manual review";
  return "Wait for official data";
}

export default function TripWeekDecisionCard({ decision }: Props) {
  ensureStyle();

  return (
    <section className={`trip-decision-card trip-decision-card-${decision.status}`}>
      <div className="trip-decision-heading">
        <div>
          <h3>CastleWatch recommendation</h3>
          <p className="muted" style={{ marginBottom: 0 }}>Unified decision from events, bookings, resorts, transportation and historical signals.</p>
        </div>
        <span className="trip-decision-status">{statusLabel(decision.status)}</span>
      </div>

      <h3 style={{ marginBottom: 5 }}>{decision.headline}</h3>
      <div className="trip-decision-summary">{decision.summary}</div>

      <div className="trip-decision-confidence">
        <strong>{decision.confidence} confidence</strong>
        <span className="muted">{decision.confidenceReason}</span>
      </div>

      <div className="trip-decision-score-grid">
        {(["base", "alternate"] as const).map((scenarioId) => {
          const scenario = decision.scenarios[scenarioId];
          return (
            <article className={`trip-decision-score ${decision.preferredScenario === scenarioId ? "trip-decision-score-preferred" : ""}`} key={scenarioId}>
              <h4>{scenario.label}{decision.preferredScenario === scenarioId ? " · Lower risk" : ""}</h4>
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
