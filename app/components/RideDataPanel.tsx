"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchRideData, type ApiResult } from "../lib/api";

type Ride = {
  id?: string | number;
  name?: string;
  ride_name?: string;
  attraction?: string;
  wait_time?: number;
  wait?: number;
  is_open?: boolean;
  land?: string;
  park?: string;
  created_at?: string;
};

const PARK_ORDER = [
  "Magic Kingdom",
  "Epcot",
  "Hollywood Studios",
  "Animal Kingdom",
];

function formatDateTime(value?: string) {
  if (!value) return "Unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getWaitLevel(wait?: number) {
  if (typeof wait !== "number") return "unknown";
  if (wait >= 60) return "high";
  if (wait >= 35) return "medium";
  return "low";
}

export default function RideDataPanel() {
  const [result, setResult] = useState<ApiResult<Ride[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  async function loadRides() {
    setLoading(true);
    const next = await fetchRideData();
    setResult(next);
    setLastRefreshed(new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }));
    setLoading(false);
  }

  useEffect(() => {
    loadRides();
  }, []);

  const rides = useMemo(() => {
    const raw = Array.isArray(result?.data) ? result.data : [];

    return raw
      .map((ride, index) => {
        const wait = ride.wait_time ?? ride.wait;
        const name =
          ride.name ||
          ride.ride_name ||
          ride.attraction ||
          `Ride ${index + 1}`;

        return {
          ...ride,
          displayName: name,
          displayPark: ride.park || "Unknown Park",
          displayWait: typeof wait === "number" ? wait : -1,
          displayUpdated: ride.created_at,
        };
      })
      .sort((a, b) => b.displayWait - a.displayWait);
  }, [result]);

  const groupedByPark = useMemo(() => {
    return PARK_ORDER.map((park) => ({
      park,
      rides: rides.filter((ride) => ride.displayPark === park),
    })).filter((group) => group.rides.length > 0);
  }, [rides]);

  const highWaitCount = rides.filter((ride) => ride.displayWait >= 60).length;
  const longestWait = rides.length > 0 ? rides[0] : null;
  const openRideCount = rides.filter((ride) => ride.is_open !== false).length;

  return (
    <div className="card half">
      <h2>All Parks Ride Dashboard</h2>

      <div className="status-row">
        <span className={`dot ${loading ? "warn" : result?.ok ? "good" : "bad"}`} />
        <strong>
          {loading
            ? "Loading Walt Disney World rides..."
            : result?.ok
              ? "Ride data loaded"
              : "Ride endpoint not ready"}
        </strong>
      </div>

      <p className="muted">
        This dashboard includes ride waits for all four Walt Disney World parks and excludes character meet-and-greet listings.
      </p>

      {result?.ok && (
        <div className="dashboard-stats">
          <div className="stat-box">
            <span className="stat-label">Rides loaded</span>
            <strong>{rides.length}</strong>
          </div>

          <div className="stat-box">
            <span className="stat-label">Open rides</span>
            <strong>{openRideCount}</strong>
          </div>

          <div className="stat-box">
            <span className="stat-label">60+ min waits</span>
            <strong>{highWaitCount}</strong>
          </div>

          <div className="stat-box">
            <span className="stat-label">Longest wait</span>
            <strong>
              {longestWait && longestWait.displayWait >= 0
                ? `${longestWait.displayWait} min`
                : "—"}
            </strong>
          </div>
        </div>
      )}

      {lastRefreshed && (
        <p className="muted">Last refreshed from CastleWatch: {lastRefreshed}</p>
      )}

      {groupedByPark.length > 0 ? (
        <div className="ride-list">
          {groupedByPark.map((group) => (
            <div key={group.park}>
              <h3>{group.park}</h3>

              {group.rides.map((ride, index) => {
                const wait =
                  ride.displayWait >= 0 ? `${ride.displayWait} min` : "—";
                const level = getWaitLevel(ride.displayWait);

                return (
                  <div className={`ride ride-${level}`} key={ride.id || `${ride.displayPark}-${ride.displayName}-${index}`}>
                    <div>
                      <strong>{ride.displayName}</strong>
                      <p className="muted">
                        {ride.land ? `${ride.land} · ` : ""}
                        {ride.is_open === false ? "Closed" : "Open"} · Updated: {formatDateTime(ride.displayUpdated)}
                      </p>
                    </div>

                    <div className="wait-pill">
                      {wait}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">
          {result?.error || "No Walt Disney World ride data displayed yet."}
        </p>
      )}

      {result?.url && (
        <p className="muted">
          Source: <span className="code">{result.url}</span>
        </p>
      )}

      <button className="button" onClick={loadRides}>
        Refresh rides
      </button>
    </div>
  );
}
