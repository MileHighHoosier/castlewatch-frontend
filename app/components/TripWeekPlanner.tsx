"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../lib/api";

const STYLE_ID = "castlewatch-trip-week-style";
const REQUEST_TIMEOUT_MS = 20_000;

type ForecastWindow = {
  window?: string;
};

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
};

type AlternateDay = {
  date: string;
  park: string;
  title: string;
  forecast?: DayForecast;
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
};

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .trip-week-planner {
      grid-column: 1 / -1;
    }

    .trip-week-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 14px;
    }

    .trip-week-header h2,
    .trip-week-header p {
      margin-top: 0;
    }

    .trip-week-status {
      border: 1px solid rgba(255, 184, 76, 0.45);
      background: rgba(255, 184, 76, 0.08);
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 900;
      white-space: nowrap;
    }

    .trip-week-warning {
      border: 1px solid rgba(255, 184, 76, 0.34);
      background: rgba(255, 184, 76, 0.07);
      border-radius: 14px;
      padding: 11px 12px;
      margin-bottom: 14px;
    }

    .trip-week-warning strong,
    .trip-week-warning p {
      margin-top: 0;
    }

    .trip-week-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .trip-week-day {
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.025);
    }

    .trip-week-day-park {
      border-color: rgba(56, 217, 150, 0.30);
      background: rgba(56, 217, 150, 0.055);
    }

    .trip-week-day-risk {
      border-color: rgba(255, 184, 76, 0.42);
      background: rgba(255, 184, 76, 0.07);
    }

    .trip-week-day-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
    }

    .trip-week-date {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      margin-bottom: 4px;
    }

    .trip-week-day h3,
    .trip-week-day p {
      margin-top: 0;
    }

    .trip-week-badge {
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 999px;
      padding: 4px 7px;
      font-size: 10px;
      font-weight: 900;
      white-space: nowrap;
    }

    .trip-week-badge-risk {
      border-color: rgba(255, 184, 76, 0.45);
    }

    .trip-week-forecast {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 7px;
      margin-top: 10px;
    }

    .trip-week-metric {
      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 11px;
      padding: 8px;
      background: rgba(0, 0, 0, 0.08);
    }

    .trip-week-metric span {
      display: block;
      color: var(--muted);
      font-size: 10px;
      font-weight: 900;
      margin-bottom: 3px;
    }

    .trip-week-metric strong {
      font-size: 13px;
      line-height: 1.2;
    }

    .trip-week-alternate {
      border: 1px solid rgba(99, 164, 255, 0.34);
      background: rgba(99, 164, 255, 0.06);
      border-radius: 16px;
      padding: 12px;
      margin-top: 14px;
    }

    .trip-week-alternate h3,
    .trip-week-alternate p {
      margin-top: 0;
    }

    .trip-week-swap-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 10px;
    }

    .trip-week-swap-item {
      border: 1px solid rgba(99, 164, 255, 0.23);
      border-radius: 12px;
      padding: 9px;
    }

    @media (max-width: 700px) {
      .trip-week-grid,
      .trip-week-swap-row,
      .trip-week-forecast {
        grid-template-columns: 1fr;
      }

      .trip-week-header {
        flex-direction: column;
      }
    }
  `;
  document.head.appendChild(style);
}

function formatDay(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString([], {
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
        <div className="trip-week-metric">
          <span>Crowd tendency</span>
          <strong>{comparisonLabel(forecast.comparison)}</strong>
        </div>
        <div className="trip-week-metric">
          <span>Confidence</span>
          <strong>{forecast.confidence?.label || "Low confidence"}</strong>
        </div>
        <div className="trip-week-metric">
          <span>Best historical window</span>
          <strong>{forecast.best_window?.window || "Still learning"}</strong>
        </div>
        <div className="trip-week-metric">
          <span>Highest-pressure period</span>
          <strong>{forecast.peak_window?.window || "Still learning"}</strong>
        </div>
      </div>
    </>
  );
}

export default function TripWeekPlanner() {
  const [plan, setPlan] = useState<TripWeekPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureStyle();

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

  const parkDays = useMemo(
    () => plan?.days.filter((day) => day.type === "park") || [],
    [plan],
  );

  if (loading) {
    return (
      <section className="card trip-week-planner">
        <h2>Columbus Day Week 2027</h2>
        <p className="muted">Building the provisional park week...</p>
      </section>
    );
  }

  if (error || !plan) {
    return (
      <section className="card trip-week-planner">
        <h2>Columbus Day Week 2027</h2>
        <p className="muted">Trip Week is temporarily unavailable. Reload to retry.</p>
      </section>
    );
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

      <div className="trip-week-warning">
        <strong>Magic Kingdom is not locked yet</strong>
        <p className="muted">
          The 2027 Mickey&apos;s Not-So-Scary Halloween Party calendar is not loaded. Keep Sunday provisional until Disney confirms whether regular Magic Kingdom hours will be shortened.
        </p>
      </div>

      <div className="trip-week-grid">
        {plan.days.map((day) => (
          <article
            className={`trip-week-day ${day.type === "park" ? "trip-week-day-park" : ""} ${day.mnsshp_status ? "trip-week-day-risk" : ""}`}
            key={day.date}
          >
            <div className="trip-week-day-top">
              <div>
                <div className="trip-week-date">{formatDay(day.date)}</div>
                <h3>{day.title}</h3>
              </div>
              <span className={`trip-week-badge ${day.mnsshp_status ? "trip-week-badge-risk" : ""}`}>
                {dayBadge(day)}
              </span>
            </div>
            {day.subtitle && <p className="muted">{day.subtitle}</p>}
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
              <ForecastMetrics forecast={day.forecast} />
            </div>
          ))}
        </div>
      </div>

      <p className="muted" style={{ marginBottom: 0, marginTop: 12 }}>
        {parkDays.length} park days · Beach Club rest day and AKL/private-tour flex day remain fixed.
      </p>
    </section>
  );
}
