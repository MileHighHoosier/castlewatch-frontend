"use client";

import { useMemo } from "react";
import { TripReservation } from "../lib/tripProfile";

const STYLE_ID = "castlewatch-special-events-style";

export type SpecialEventSignal = {
  id: string;
  status: string;
  severity: "low" | "medium" | "high";
  label: string;
  summary: string;
};

export type SpecialEventScenario = {
  id: "base" | "alternate";
  label: string;
  assignments: Record<string, string>;
  event_risk_score: number;
  reasons: string[];
  lock_status: string;
};

export type SpecialEventIntelligenceData = {
  generated_at: string;
  overall_status: string;
  sources: Array<{
    id: string;
    label: string;
    status: string;
    loaded_dates?: string[];
    note: string;
  }>;
  tracked_items: Array<{
    id: string;
    name: string;
    park?: string | null;
    priority: string;
    schedule_status: string;
  }>;
  day_signals: Array<{
    date: string;
    signals: SpecialEventSignal[];
  }>;
  scenarios: {
    base: SpecialEventScenario;
    alternate: SpecialEventScenario;
  };
  recommendation: {
    status: string;
    preferred_scenario: "base" | "alternate";
    headline: string;
    summary: string;
    decision_rule: string;
  };
};

type Props = {
  intelligence?: SpecialEventIntelligenceData;
  reservations: TripReservation[];
};

type ScenarioImpact = {
  confirmed: TripReservation[];
  provisional: TripReservation[];
};

const PARKS = ["Magic Kingdom", "Epcot", "Hollywood Studios", "Animal Kingdom"];

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .special-event-card { border:1px solid rgba(255,184,76,.34); background:rgba(255,184,76,.055); border-radius:16px; padding:13px; margin-bottom:14px; }
    .special-event-card h3, .special-event-card p { margin-top:0; }
    .special-event-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
    .special-event-status { border:1px solid rgba(255,184,76,.42); border-radius:999px; padding:4px 8px; font-size:10px; font-weight:900; white-space:nowrap; }
    .special-event-source-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:10px 0; }
    .special-event-source { border:1px solid rgba(255,255,255,.1); border-radius:11px; padding:9px; background:rgba(0,0,0,.08); }
    .special-event-source span { display:block; color:var(--muted); font-size:10px; font-weight:900; margin-bottom:3px; }
    .special-event-source strong { font-size:13px; }
    .special-event-recommendation { border:1px solid rgba(99,164,255,.32); border-radius:13px; padding:10px 11px; background:rgba(99,164,255,.055); margin:10px 0; }
    .special-event-recommendation strong { display:block; margin-bottom:4px; }
    .special-event-scenarios { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
    .special-event-scenario { border:1px solid rgba(255,255,255,.12); border-radius:13px; padding:10px; background:rgba(0,0,0,.08); }
    .special-event-scenario-preferred { border-color:rgba(56,217,150,.34); background:rgba(56,217,150,.055); }
    .special-event-scenario h4 { margin:0 0 7px; }
    .special-event-risk { color:var(--muted); font-size:11px; margin-bottom:7px; }
    .special-event-impact { margin-top:8px; border-top:1px solid rgba(255,255,255,.08); padding-top:7px; }
    .special-event-impact strong { display:block; font-size:11px; margin-bottom:4px; }
    .special-event-impact ul, .special-event-reasons { margin:5px 0 0; padding-left:18px; font-size:12px; }
    .special-event-impact-confirmed { color:rgb(255,170,170); }
    .special-event-impact-provisional { color:rgb(255,210,135); }
    .special-event-details { margin-top:10px; border-top:1px solid rgba(255,255,255,.1); padding-top:9px; }
    .special-event-details summary { cursor:pointer; font-weight:900; }
    .special-event-tracked { display:grid; gap:7px; margin-top:9px; }
    .special-event-tracked-row { display:flex; justify-content:space-between; gap:10px; border:1px solid rgba(255,255,255,.09); border-radius:10px; padding:8px; }
    @media (max-width:700px) {
      .special-event-source-grid, .special-event-scenarios { grid-template-columns:1fr; }
      .special-event-heading { flex-direction:column; }
    }
  `;
  document.head.appendChild(style);
}

function reservationPark(reservation: TripReservation) {
  return PARKS.includes(reservation.location) ? reservation.location : null;
}

function scenarioImpact(scenario: SpecialEventScenario, reservations: TripReservation[]): ScenarioImpact {
  const affected = reservations.filter((reservation) => {
    const park = reservationPark(reservation);
    if (!park) return false;
    const assignment = scenario.assignments[reservation.date];
    return Boolean(assignment && assignment !== park);
  });

  return {
    confirmed: affected.filter((reservation) => reservation.status === "confirmed"),
    provisional: affected.filter((reservation) => reservation.status !== "confirmed"),
  };
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function impactSummary(impact: ScenarioImpact) {
  if (!impact.confirmed.length && !impact.provisional.length) return "No park-reservation conflicts";
  const parts = [];
  if (impact.confirmed.length) parts.push(`${impact.confirmed.length} confirmed affected`);
  if (impact.provisional.length) parts.push(`${impact.provisional.length} provisional affected`);
  return parts.join(" · ");
}

export default function SpecialEventIntelligence({ intelligence, reservations }: Props) {
  ensureStyle();

  const impacts = useMemo(() => {
    if (!intelligence) return null;
    return {
      base: scenarioImpact(intelligence.scenarios.base, reservations),
      alternate: scenarioImpact(intelligence.scenarios.alternate, reservations),
    };
  }, [intelligence, reservations]);

  if (!intelligence || !impacts) {
    return (
      <div className="special-event-card">
        <h3>Holiday & special-event intelligence</h3>
        <p className="muted" style={{ marginBottom: 0 }}>Special-event status is temporarily unavailable.</p>
      </div>
    );
  }

  const backendPreference = intelligence.recommendation.preferred_scenario;
  const baseConfirmed = impacts.base.confirmed.length;
  const alternateConfirmed = impacts.alternate.confirmed.length;
  const reservationPreference = baseConfirmed < alternateConfirmed
    ? "base"
    : alternateConfirmed < baseConfirmed
      ? "alternate"
      : backendPreference;
  const finalPreference = intelligence.recommendation.status === "wait_for_calendar"
    ? "base"
    : reservationPreference;

  const recommendationSummary = intelligence.recommendation.status === "wait_for_calendar"
    ? `${intelligence.recommendation.summary} CastleWatch currently keeps the base plan because the official decision trigger has not occurred.`
    : reservationPreference !== backendPreference
      ? `${intelligence.recommendation.summary} Confirmed reservations favor the ${reservationPreference === "base" ? "base plan" : "alternate"}, so review those bookings before applying the event recommendation.`
      : intelligence.recommendation.summary;

  return (
    <section className="special-event-card">
      <div className="special-event-heading">
        <div>
          <h3>Holiday & special-event intelligence</h3>
          <p className="muted">Tracks MNSSHP, Columbus Day, park hours, Early Entry and Extended Evening Hours.</p>
        </div>
        <span className="special-event-status">{intelligence.overall_status === "official" ? "Official data loaded" : "Provisional"}</span>
      </div>

      <div className="special-event-source-grid">
        {intelligence.sources.map((source) => (
          <div className="special-event-source" key={source.id}>
            <span>{source.label}</span>
            <strong>{source.status === "official" ? "Official" : source.status === "partial" ? "Partially loaded" : "Not released"}</strong>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{source.note}</div>
          </div>
        ))}
      </div>

      <div className="special-event-recommendation">
        <strong>{intelligence.recommendation.headline}</strong>
        <div>{recommendationSummary}</div>
        <div className="muted" style={{ marginTop: 5, fontSize: 11 }}><strong style={{ display: "inline" }}>Decision rule:</strong> {intelligence.recommendation.decision_rule}</div>
      </div>

      <div className="special-event-scenarios">
        {(["base", "alternate"] as const).map((scenarioId) => {
          const scenario = intelligence.scenarios[scenarioId];
          const impact = impacts[scenarioId];
          return (
            <article className={`special-event-scenario ${scenarioId === finalPreference ? "special-event-scenario-preferred" : ""}`} key={scenarioId}>
              <h4>{scenario.label}{scenarioId === finalPreference ? " · Current preference" : ""}</h4>
              <div className="special-event-risk">Event-risk score: {scenario.event_risk_score} · {impactSummary(impact)}</div>
              <ul className="special-event-reasons">
                {Object.entries(scenario.assignments).map(([date, park]) => <li key={`${scenarioId}-${date}`}>{formatDate(date)}: {park}</li>)}
              </ul>
              {scenario.reasons.length > 0 && (
                <ul className="special-event-reasons">
                  {scenario.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              )}
              {(impact.confirmed.length > 0 || impact.provisional.length > 0) && (
                <div className="special-event-impact">
                  <strong>Reservation impact</strong>
                  {impact.confirmed.length > 0 && (
                    <ul className="special-event-impact-confirmed">
                      {impact.confirmed.map((reservation) => <li key={reservation.id}>Confirmed: {reservation.title} on {formatDate(reservation.date)}</li>)}
                    </ul>
                  )}
                  {impact.provisional.length > 0 && (
                    <ul className="special-event-impact-provisional">
                      {impact.provisional.map((reservation) => <li key={reservation.id}>Provisional: {reservation.title} on {formatDate(reservation.date)}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <details className="special-event-details">
        <summary>Tracked calendars and programs</summary>
        <div className="special-event-tracked">
          {intelligence.tracked_items.map((item) => (
            <div className="special-event-tracked-row" key={item.id}>
              <div><strong>{item.name}</strong><div className="muted" style={{ fontSize: 11 }}>{item.park || "Resort-wide"}</div></div>
              <span>{item.schedule_status === "official" || item.schedule_status === "confirmed" ? "Loaded" : "Pending"}</span>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
