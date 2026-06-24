"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../lib/api";
import SpecialEventIntelligence, {
  SpecialEventIntelligenceData,
  SpecialEventSignal,
} from "./SpecialEventIntelligence";
import TripWeekDecisionPanel from "./TripWeekDecisionPanel";
import TripProfileReservations from "./TripProfileReservations";
import { TripReservation, loadReservations } from "../lib/tripProfile";
import {
  DEFAULT_RESORT_PLAN,
  RESORT_OPTIONS,
  ResortPlan,
  loadResortPlan,
  saveResortPlan,
} from "../lib/tripResorts";

const STYLE_ID = "castlewatch-trip-week-style";
const REQUEST_TIMEOUT_MS = 20_000;
const CALENDAR_REFRESH_TIMEOUT_MS = 35_000;

type ForecastWindow = { window?: string };
type DayForecast = {
  status?: string;
  comparison?: string;
  summary?: string;
  confidence?: { label?: string };
  best_window?: ForecastWindow | null;
  peak_window?: ForecastWindow | null;
};

type TripDay = {
  date: string;
  type: "arrival" | "park" | "rest" | "flex" | "departure";
  park?: string;
  title: string;
  subtitle?: string;
  holiday?: string;
  mnsshp_status?: string;
  mnsshp_label?: string;
  forecast?: DayForecast;
  special_event_signals?: SpecialEventSignal[];
};

type AlternateDay = {
  date: string;
  park: string;
  title: string;
  forecast?: DayForecast;
  special_event_signals?: SpecialEventSignal[];
};

type TripWeekPlan = {
  trip_name: string;
  start_date: string;
  end_date: string;
  status: string;
  party_schedule_status?: string;
  constraints?: string[];
  days: TripDay[];
  alternate_swap?: {
    condition?: string;
    reason?: string;
    days?: AlternateDay[];
  };
  special_event_intelligence?: SpecialEventIntelligenceData;
};

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .trip-week-planner { grid-column:1 / -1; }
    .trip-week-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:14px; }
    .trip-week-header h2, .trip-week-header p { margin-top:0; }
    .trip-week-status { border:1px solid rgba(255,184,76,.45); background:rgba(255,184,76,.08); border-radius:999px; padding:5px 10px; font-size:11px; font-weight:900; white-space:nowrap; }
    .trip-week-save-note { border:1px solid rgba(99,164,255,.28); background:rgba(99,164,255,.055); border-radius:13px; padding:10px 12px; margin-bottom:14px; }
    .trip-week-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .trip-week-day { border:1px solid rgba(255,255,255,.12); border-radius:16px; padding:12px; background:rgba(255,255,255,.025); }
    .trip-week-day-park { border-color:rgba(56,217,150,.30); background:rgba(56,217,150,.055); }
    .trip-week-day-risk { border-color:rgba(255,184,76,.42); background:rgba(255,184,76,.07); }
    .trip-week-day-top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
    .trip-week-date { color:var(--muted); font-size:12px; font-weight:800; margin-bottom:4px; }
    .trip-week-day h3, .trip-week-day p { margin-top:0; }
    .trip-week-badge { border:1px solid rgba(255,255,255,.16); border-radius:999px; padding:4px 7px; font-size:10px; font-weight:900; white-space:nowrap; }
    .trip-week-badge-risk { border-color:rgba(255,184,76,.45); }
    .trip-week-event-signals { display:grid; gap:6px; margin:9px 0; }
    .trip-week-event-signal { border:1px solid rgba(255,255,255,.11); border-radius:10px; padding:7px 8px; font-size:11px; background:rgba(0,0,0,.08); }
    .trip-week-event-signal strong { display:block; margin-bottom:2px; }
    .trip-week-event-high { border-color:rgba(255,99,99,.35); background:rgba(255,99,99,.06); }
    .trip-week-event-medium { border-color:rgba(255,184,76,.34); background:rgba(255,184,76,.06); }
    .trip-week-resort-editor { border:1px solid rgba(99,164,255,.24); border-radius:12px; padding:9px 10px; margin:10px 0; background:rgba(99,164,255,.04); }
    .trip-week-resort-editor span { display:block; color:var(--muted); font-size:10px; font-weight:900; margin-bottom:5px; }
    .trip-week-resort-editor select { width:100%; border:1px solid rgba(255,255,255,.15); border-radius:9px; padding:8px; background:rgba(0,0,0,.17); color:inherit; font:inherit; }
    .trip-week-bookings { border:1px solid rgba(156,118,255,.28); background:rgba(156,118,255,.055); border-radius:12px; padding:9px 10px; margin:10px 0; }
    .trip-week-bookings-title { font-size:11px; font-weight:900; margin-bottom:6px; }
    .trip-week-booking { display:flex; justify-content:space-between; gap:8px; align-items:center; padding:5px 0; border-top:1px solid rgba(255,255,255,.08); }
    .trip-week-booking:first-of-type { border-top:0; }
    .trip-week-booking-status { border:1px solid rgba(255,184,76,.35); border-radius:999px; padding:3px 6px; font-size:9px; font-weight:900; white-space:nowrap; }
    .trip-week-booking-confirmed { border-color:rgba(56,217,150,.4); color:rgb(124,239,191); }
    .trip-week-forecast { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; margin-top:10px; }
    .trip-week-metric { border:1px solid rgba(255,255,255,.10); border-radius:11px; padding:8px; background:rgba(0,0,0,.08); }
    .trip-week-metric span { display:block; color:var(--muted); font-size:10px; font-weight:900; margin-bottom:3px; }
    .trip-week-metric strong { font-size:13px; line-height:1.2; }
    .trip-week-alternate { border:1px solid rgba(99,164,255,.34); background:rgba(99,164,255,.06); border-radius:16px; padding:12px; margin-top:14px; }
    .trip-week-alternate h3, .trip-week-alternate p { margin-top:0; }
    .trip-week-swap-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:10px; }
    .trip-week-swap-item { border:1px solid rgba(99,164,255,.23); border-radius:12px; padding:9px; }
    @media (max-width:700px) {
      .trip-week-grid, .trip-week-swap-row, .trip-week-forecast { grid-template-columns:1fr; }
      .trip-week-header { flex-direction:column; }
    }
  `;
  document.head.appendChild(style);
}

function formatDay(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function comparisonLabel(value?: string) {
  const labels: Record<string, string> = {
    noticeably_quieter: "Noticeably quieter",
    slightly_quieter: "Slightly quieter",
    noticeably_busier: "Noticeably busier",
    slightly_busier: "Slightly busier",
    near_typical: "Near typical",
  };
  return value ? labels[value] || value.replaceAll("_", " ") : "Still learning";
}

function dayBadge(day: TripDay) {
  if (day.mnsshp_status) return day.mnsshp_label || "MNSSHP check";
  if (day.holiday) return day.holiday;
  if (day.type === "park") return "Park day";
  if (day.type === "rest") return "Rest day";
  if (day.type === "flex") return "Fixed flex day";
  if (day.type === "arrival") return "Arrival";
  return "Departure";
}

function ForecastMetrics({ forecast }: { forecast?: DayForecast }) {
  if (!forecast || forecast.status === "unavailable") {
    return <p className="muted">Historical forecast is temporarily unavailable.</p>;
  }

  return (
    <>
      <p className="muted">{forecast.summary}</p>
      <div className="trip-week-forecast">
        <div className="trip-week-metric"><span>Crowd tendency</span><strong>{comparisonLabel(forecast.comparison)}</strong></div>
        <div className="trip-week-metric"><span>Confidence</span><strong>{forecast.confidence?.label || "Low confidence"}</strong></div>
        <div className="trip-week-metric"><span>Best historical window</span><strong>{forecast.best_window?.window || "Still learning"}</strong></div>
        <div className="trip-week-metric"><span>Highest-pressure period</span><strong>{forecast.peak_window?.window || "Still learning"}</strong></div>
      </div>
    </>
  );
}

function DayBookings({ reservations }: { reservations: TripReservation[] }) {
  if (!reservations.length) return null;
  return (
    <div className="trip-week-bookings">
      <div className="trip-week-bookings-title">{reservations.length} reservation{reservations.length === 1 ? "" : "s"}</div>
      {reservations.map((reservation) => (
        <div className="trip-week-booking" key={reservation.id}>
          <div><strong>{reservation.time}</strong> · {reservation.title}</div>
          <span className={`trip-week-booking-status ${reservation.status === "confirmed" ? "trip-week-booking-confirmed" : ""}`}>
            {reservation.status === "confirmed" ? "Confirmed" : "Provisional"}
          </span>
        </div>
      ))}
    </div>
  );
}

function DayEventSignals({ signals }: { signals?: SpecialEventSignal[] }) {
  if (!signals?.length) return null;
  return (
    <div className="trip-week-event-signals">
      {signals.map((signal) => (
        <div className={`trip-week-event-signal trip-week-event-${signal.severity}`} key={`${signal.id}-${signal.status}`}>
          <strong>{signal.label}</strong>
          <span className="muted">{signal.summary}</span>
        </div>
      ))}
    </div>
  );
}

export default function TripWeekPlanner() {
  const [plan, setPlan] = useState<TripWeekPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarRefreshing, setCalendarRefreshing] = useState(false);
  const [calendarRefreshError, setCalendarRefreshError] = useState<string | null>(null);
  const [resortPlan, setResortPlan] = useState<ResortPlan>({ ...DEFAULT_RESORT_PLAN });
  const [reservations, setReservations] = useState<TripReservation[]>([]);

  useEffect(() => {
    ensureStyle();
    setResortPlan(loadResortPlan());
    setReservations(loadReservations());

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    async function load() {
      try {
        if (!API_BASE_URL) throw new Error("Backend URL is missing.");
        const response = await fetch(`${API_BASE_URL}/api/trip-week`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || data?.status === "error") {
          throw new Error(data?.message || "Trip Week planner did not load.");
        }
        setPlan(data);
        setError(null);
      } catch (loadError) {
        const message = loadError instanceof Error && loadError.name === "AbortError"
          ? "Trip Week planning request timed out."
          : loadError instanceof Error
            ? loadError.message
            : "Trip Week planner did not load.";
        setError(message);
      } finally {
        window.clearTimeout(timeout);
        setLoading(false);
      }
    }

    void load();
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  async function refreshCalendar() {
    if (!API_BASE_URL || calendarRefreshing) return;

    setCalendarRefreshing(true);
    setCalendarRefreshError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CALENDAR_REFRESH_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE_URL}/api/trip-week?refresh_calendar=1`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || data?.status === "error") {
        throw new Error(data?.message || "Calendar refresh did not finish.");
      }
      setPlan(data);
      setCalendarRefreshError(null);
    } catch (refreshError) {
      const message = refreshError instanceof Error && refreshError.name === "AbortError"
        ? "Calendar check timed out. CastleWatch kept the last known schedule."
        : refreshError instanceof Error
          ? refreshError.message
          : "Calendar check failed. CastleWatch kept the last known schedule.";
      setCalendarRefreshError(message);
    } finally {
      window.clearTimeout(timeout);
      setCalendarRefreshing(false);
    }
  }

  function changeResort(date: string, resortId: string) {
    const next = { ...resortPlan, [date]: resortId };
    setResortPlan(next);
    saveResortPlan(next);
  }

  const parkDays = useMemo(
    () => plan?.days.filter((day) => day.type === "park") || [],
    [plan],
  );

  const assignedParks = useMemo(() => {
    const mapping: Record<string, string> = {};
    for (const day of plan?.days || []) {
      if (day.type === "park" && day.park) mapping[day.date] = day.park;
    }
    return mapping;
  }, [plan]);

  const reservationsByDate = useMemo(() => {
    const mapping: Record<string, TripReservation[]> = {};
    for (const reservation of reservations) {
      if (!mapping[reservation.date]) mapping[reservation.date] = [];
      mapping[reservation.date].push(reservation);
    }
    return mapping;
  }, [reservations]);

  if (loading) {
    return <section className="card trip-week-planner"><h2>Columbus Day Week 2027</h2><p className="muted">Building the provisional park week...</p></section>;
  }

  if (error || !plan) {
    return <section className="card trip-week-planner"><h2>Columbus Day Week 2027</h2><p className="muted">Trip Week is temporarily unavailable. Reload to retry.</p></section>;
  }

  return (
    <section className="card trip-week-planner">
      <div className="trip-week-header">
        <div>
          <h2>{plan.trip_name}</h2>
          <p className="muted">Oct. 9–16, 2027 · one park per day · no park hopping</p>
        </div>
        <span className="trip-week-status">Provisional</span>
      </div>

      <TripWeekDecisionPanel plan={plan} />

      <SpecialEventIntelligence
        intelligence={plan.special_event_intelligence}
        reservations={reservations}
        refreshing={calendarRefreshing}
        refreshError={calendarRefreshError}
        onRefresh={() => void refreshCalendar()}
      />

      <TripProfileReservations
        assignedParks={assignedParks}
        resortPlan={resortPlan}
        reservations={reservations}
        onReservationsChange={setReservations}
      />

      <div className="trip-week-save-note">
        <strong>Resort nights are editable</strong>
        <div className="muted">Change any overnight resort after bookings are made. Choices save automatically on this device and update Getting There routes.</div>
      </div>

      <div className="trip-week-grid">
        {plan.days.map((day) => (
          <article
            className={`trip-week-day ${day.type === "park" ? "trip-week-day-park" : ""} ${day.mnsshp_status ? "trip-week-day-risk" : ""}`}
            key={day.date}
          >
            <div className="trip-week-day-top">
              <div><div className="trip-week-date">{formatDay(day.date)}</div><h3>{day.title}</h3></div>
              <span className={`trip-week-badge ${day.mnsshp_status ? "trip-week-badge-risk" : ""}`}>{dayBadge(day)}</span>
            </div>
            {day.subtitle && <p className="muted">{day.subtitle}</p>}

            <DayEventSignals signals={day.special_event_signals} />
            <DayBookings reservations={reservationsByDate[day.date] || []} />

            {day.type !== "departure" && resortPlan[day.date] && (
              <label className="trip-week-resort-editor">
                <span>Overnight after this day</span>
                <select value={resortPlan[day.date]} onChange={(event) => changeResort(day.date, event.target.value)}>
                  {RESORT_OPTIONS.map((resort) => <option key={resort.id} value={resort.id}>{resort.name}</option>)}
                </select>
              </label>
            )}

            {day.type === "park" && <ForecastMetrics forecast={day.forecast} />}
          </article>
        ))}
      </div>

      <div className="trip-week-alternate">
        <h3>MNSSHP alternate swap</h3>
        <p className="muted">{plan.alternate_swap?.condition}</p>
        <p>{plan.alternate_swap?.reason}</p>
        <div className="trip-week-swap-row">
          {(plan.alternate_swap?.days || []).map((day) => (
            <div className="trip-week-swap-item" key={`${day.date}-${day.park}`}>
              <div className="trip-week-date">{formatDay(day.date)}</div>
              <strong>{day.title}</strong>
              <DayEventSignals signals={day.special_event_signals} />
              <ForecastMetrics forecast={day.forecast} />
            </div>
          ))}
        </div>
      </div>

      <p className="muted" style={{ marginBottom:0, marginTop:12 }}>
        {parkDays.length} park days · {reservations.length} reservations tracked · overnight resorts remain editable.
      </p>
    </section>
  );
}
