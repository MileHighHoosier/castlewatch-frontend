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

export type CalendarIngestionStatus = {
  source_key?: string;
  source?: string;
  status?: "fresh" | "partial" | "stale" | "unavailable" | "unreleased" | string;
  checked_at?: string | null;
  last_success_at?: string | null;
  last_changed_at?: string | null;
  freshness_hours?: number | null;
  changed?: boolean;
  error?: string | null;
  data?: {
    party_dates?: string[];
    relevant_park_dates_loaded?: number;
    relevant_park_dates_expected?: number;
  };
};

export type SpecialEventIntelligenceData = {
  generated_at: string;
  overall_status: string;
  calendar_ingestion?: CalendarIngestionStatus;
  sources: Array<{
    id: string;
    label: string;
    status: string;
    data_status?: string;
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
  refreshing?: boolean;
  refreshError?: string | null;
  onRefresh?: () => void;
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
    .special-event-status-official { border-color:rgba(56,217,150,.42); color:rgb(124,239,191); }
    .special-event-status-stale, .special-event-status-unavailable { border-color:rgba(255,99,99,.42); color:rgb(255,170,170); }
    .special-event-actions { display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap; margin:10px 0; }
    .special-event-refresh { border:1px solid rgba(99,164,255,.48); border-radius:10px; padding:8px 10px; background:rgba(99,164,255,.09); color:inherit; font-weight:900; }
    .special-event-refresh:disabled { opacity:.58; cursor:wait; }
    .special-event-freshness { color:var(--muted); font-size:11px; line-height:1.35; }
    .special-event-refresh-result { border-radius:10px; padding:8px 9px; font-size:11px; margin:8px 0; }
    .special-event-refresh-changed { border:1px solid rgba(56,217,150,.35); background:rgba(56,217,150,.06); }
    .special-event-refresh-error { border:1px solid rgba(255,99,99,.4); background:rgba(255,99,99,.07); }
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

function formatTimestamp(value?: string | null) {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function impactSummary(impact: ScenarioImpact) {
  if (!impact.confirmed.length && !impact.provisional.length) return "No park-reservation conflicts";
  const parts = [];
  if (impact.confirmed.length) parts.push(`${impact.confirmed.length} confirmed affected`);
  if (impact.provisional.length) parts.push(`${impact.provisional.length} provisional affected`);
  return parts.join(" · ");
}

function sourceStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    official: "Official",
    partial: "Partially loaded",
    stale: "Stale cache",
    unavailable: "Unavailable",
    unreleased: "Not released",
    fresh: "Checked",
  };
  return labels[status || ""] || "Provisional";
}

function overallStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    official: "Official data loaded",
    partial: "Partially loaded",
    stale: "Using stale cache",
    unavailable: "Source unavailable",
    provisional: "Provisional",
  };
  return labels[status || ""] || "Provisional";
}

export default function SpecialEventIntelligence({
  intelligence,
  reservations,
  refreshing = false,
  refreshError,
  onRefresh,
}: Props) {
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

  const ingestion = intelligence.calendar_ingestion;
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
        <span className={`special-event-status special-event-status-${intelligence.overall_status}`}>
          {overallStatusLabel(intelligence.overall_status)}
        </span>
      </div>

      <div className="special-event-actions">
        <button className="special-event-refresh" type="button" onClick={onRefresh} disabled={refreshing || !onRefresh}>
          {refreshing ? "Checking calendars…" : "Check for updates"}
        </button>
        <div className="special-event-freshness">
          <div>Last checked: {formatTimestamp(ingestion?.checked_at)}</div>
          <div>Last successful: {formatTimestamp(ingestion?.last_success_at)}</div>
          {ingestion?.freshness_hours !== null && ingestion?.freshness_hours !== undefined && (
            <div>Cache age: {ingestion.freshness_hours} hours</div>
          )}
        </div>
      </div>

      {ingestion?.changed && (
        <div className="special-event-refresh-result special-event-refresh-changed">
          Calendar data changed during the latest check. Trip Week has been recalculated.
        </div>
      )}
      {refreshError && (
        <div className="special-event-refresh-result special-event-refresh-error">{refreshError}</div>
      )}
      {!refreshError && ingestion?.error && (
        <div className="special-event-refresh-result special-event-refresh-error">
          The latest source check had an error. CastleWatch preserved the last known good schedule: {ingestion.error}
        </div>
      )}

      <div className="special-event-source-grid">
        {intelligence.sources.map((source) => (
          <div className="special-event-source" key={source.id}>
            <span>{source.label}</span>
            <strong>{sourceStatusLabel(source.status)}</strong>
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
              <span>{item.schedule_status === "official" || item.schedule_status === "confirmed" ? "Loaded" : item.schedule_status === "partial" ? "Partial" : "Pending"}</span>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
