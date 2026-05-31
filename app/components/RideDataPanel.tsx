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

type RideDataPanelProps = {
  selectedPark: string;
  onSelectPark: (park: string) => void;
};

const PARK_ORDER = [
  "Magic Kingdom",
  "Epcot",
  "Hollywood Studios",
  "Animal Kingdom",
  "Unknown Park",
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

function normalizeParkName(value?: string) {
  if (!value) return "Unknown Park";

  const normalized = value.trim().toLowerCase();

  if (normalized.includes("magic kingdom")) return "Magic Kingdom";
  if (normalized.includes("epcot")) return "Epcot";
  if (normalized.includes("hollywood")) return "Hollywood Studios";
  if (normalized.includes("animal kingdom")) return "Animal Kingdom";

  return value.trim() || "Unknown Park";
}

function getWaitLevel(wait?: number) {
  if (typeof wait !== "number") return "unknown";
  if (wait >= 60) return "high";
  if (wait >= 35) return "medium";
  return "low";
}

export default function RideDataPanel({ selectedPark, onSelectPark }: RideDataPanelProps) {
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
          displayPark: normalizeParkName(ride.park),
          displayWait: typeof wait === "number" ? wait : -1,
          displayUpdated: ride.created_at,
        };
      })
      .sort((a, b) => b.displayWait - a.displayWait);
  }, [result]);

  const groupedByPark = useMemo(() => {
    const groups = new Map<string, typeof rides>();

    for (const ride of rides) {
      const park = ride.displayPark || "Unknown Park";
      groups.set(park, [...(groups.get(park) || []), ride]);
    }

    return Array.from(groups.entries())
      .map(([park, parkRides]) => ({ park, rides: parkRides }))
      .sort((a, b) => {
        const aIndex = PARK_ORDER.indexOf(a.park);
        const bIndex = PARK_ORDER.indexOf(b.park);

        if (aIndex === -1 && bIndex === -1) return a.park.localeCompare(b.park);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
  }, [rides]);

  const availableParks = groupedByPark.map((group) => group.park);
  const activePark = availableParks.includes(selectedPark)
    ? selectedPark
    : availableParks[0] || selectedPark;
  const activeGroup = groupedByPark.find((group) => group.park === activePark);
  const visibleRides = activeGroup?.rides || [];

  useEffect(() => {
    if (!availableParks.length) return;
    if (!availableParks.includes(selectedPark)) {
      onSelectPark(availableParks[0]);
    }
  }, [availableParks, onSelectPark, selectedPark]);

  const highWaitCount = visibleRides.filter((ride) => ride.displayWait >= 60).length;
  const longestWait = visibleRides.length > 0 ? visibleRides[0] : null;
  const openRideCount = visibleRides.filter((ride) => ride.is_open !== false).length;

  return (
    <div className="card half">
      <h2>Park Ride Dashboard</h2>

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
        Use the park banner at the top of the page to switch parks. Character meets and non-ride experiences are filtered out.
      </p>

      {result?.ok && (
        <div className="dashboard-stats">
          <div className="stat-box">
            <span className="stat-label">Selected park</span>
            <strong>{activePark}</strong>
          </div>

          <div className="stat-box">
            <span className="stat-label">Rides loaded</span>
            <strong>{visibleRides.length}</strong>
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

      {visibleRides.length > 0 ? (
        <div className="ride-list">
          <h3>{activePark}</h3>

          {visibleRides.map((ride, index) => {
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
      ) : (
        <p className="muted">
          {result?.error || "No ride-demand attractions displayed for this park yet."}
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
