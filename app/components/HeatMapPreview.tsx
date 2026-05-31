"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchRideData, type ApiResult } from "../lib/api";

type Ride = {
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

type HeatZone = {
  park: string;
  land: string;
  rides: Ride[];
  openRides: Ride[];
  averageWait: number;
  longestWait: number;
  topRide: string;
  pressure: "Low" | "Moderate" | "High" | "Very High";
};

const PARK_ORDER = [
  "Magic Kingdom",
  "Epcot",
  "Hollywood Studios",
  "Animal Kingdom",
];

const PARK_ICONS: Record<string, string> = {
  "Magic Kingdom": "🏰",
  Epcot: "🌐",
  "Hollywood Studios": "🎬",
  "Animal Kingdom": "🌳",
};

function normalizeParkName(value?: string) {
  if (!value) return "Unknown Park";

  const normalized = value.trim().toLowerCase();

  if (normalized.includes("magic kingdom")) return "Magic Kingdom";
  if (normalized.includes("epcot")) return "Epcot";
  if (normalized.includes("hollywood")) return "Hollywood Studios";
  if (normalized.includes("animal kingdom")) return "Animal Kingdom";

  return value.trim() || "Unknown Park";
}

function getRideName(ride: Ride, index: number) {
  return ride.name || ride.ride_name || ride.attraction || `Attraction ${index + 1}`;
}

function getWait(ride: Ride) {
  const wait = ride.wait_time ?? ride.wait;
  return typeof wait === "number" ? wait : 0;
}

function getPressure(averageWait: number, longestWait: number): HeatZone["pressure"] {
  if (averageWait >= 45 || longestWait >= 80) return "Very High";
  if (averageWait >= 30 || longestWait >= 60) return "High";
  if (averageWait >= 15 || longestWait >= 35) return "Moderate";
  return "Low";
}

function pressureClass(pressure: HeatZone["pressure"]) {
  if (pressure === "Very High") return "zone-very-high";
  if (pressure === "High") return "zone-high";
  if (pressure === "Moderate") return "zone-moderate";
  return "zone-low";
}

export default function HeatMapPreview() {
  const [result, setResult] = useState<ApiResult<Ride[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPark, setSelectedPark] = useState("Magic Kingdom");
  const [lastRefreshed, setLastRefreshed] = useState("");

  async function loadHeatMap() {
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
    loadHeatMap();
  }, []);

  const rides = useMemo(() => {
    const raw = Array.isArray(result?.data) ? result.data : [];

    return raw.map((ride) => ({
      ...ride,
      park: normalizeParkName(ride.park),
      land: ride.land || "Unassigned Area",
    }));
  }, [result]);

  const availableParks = useMemo(() => {
    const parks = Array.from(new Set(rides.map((ride) => ride.park || "Unknown Park")));

    return parks.sort((a, b) => {
      const aIndex = PARK_ORDER.indexOf(a);
      const bIndex = PARK_ORDER.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [rides]);

  const activePark = availableParks.includes(selectedPark)
    ? selectedPark
    : availableParks[0] || selectedPark;

  const zones = useMemo(() => {
    const parkRides = rides.filter((ride) => ride.park === activePark);
    const groups = new Map<string, Ride[]>();

    for (const ride of parkRides) {
      const land = ride.land || "Unassigned Area";
      groups.set(land, [...(groups.get(land) || []), ride]);
    }

    return Array.from(groups.entries())
      .map(([land, landRides]) => {
        const openRides = landRides.filter((ride) => ride.is_open !== false);
        const waits = openRides.map(getWait);
        const longestWait = waits.length ? Math.max(...waits) : 0;
        const averageWait = waits.length
          ? Math.round(waits.reduce((sum, wait) => sum + wait, 0) / waits.length)
          : 0;
        const topRideIndex = landRides.findIndex((ride) => getWait(ride) === longestWait);
        const topRide = topRideIndex >= 0 ? getRideName(landRides[topRideIndex], topRideIndex) : "No open rides";

        return {
          park: activePark,
          land,
          rides: landRides,
          openRides,
          averageWait,
          longestWait,
          topRide,
          pressure: getPressure(averageWait, longestWait),
        } satisfies HeatZone;
      })
      .sort((a, b) => b.longestWait - a.longestWait || b.averageWait - a.averageWait);
  }, [activePark, rides]);

  const hottestZone = zones[0];

  return (
    <div className="card">
      <h2>Live Park Heat Map</h2>
      <p className="muted">
        Live demand zones are calculated from current ride waits grouped by park area. Higher waits make an area hotter.
      </p>

      <div className="status-row">
        <span className={`dot ${loading ? "warn" : result?.ok ? "good" : "bad"}`} />
        <strong>
          {loading
            ? "Building live heat map..."
            : result?.ok
              ? "Live heat map loaded"
              : "Heat map data not ready"}
        </strong>
      </div>

      {availableParks.length > 0 && (
        <div className="park-tabs compact" role="tablist" aria-label="Choose heat map park">
          {availableParks.map((park) => (
            <button
              className={`park-tab ${park === activePark ? "park-tab-active" : ""}`}
              key={park}
              onClick={() => setSelectedPark(park)}
              role="tab"
              aria-selected={park === activePark}
              type="button"
            >
              <span className="park-tab-icon" aria-hidden="true">
                {PARK_ICONS[park] || "✨"}
              </span>
              <span className="park-tab-label">{park}</span>
            </button>
          ))}
        </div>
      )}

      {hottestZone && (
        <div className="heat-summary">
          <div>
            <span className="stat-label">Hottest area</span>
            <strong>{hottestZone.land}</strong>
          </div>
          <div>
            <span className="stat-label">Highest wait</span>
            <strong>{hottestZone.longestWait} min</strong>
          </div>
          <div>
            <span className="stat-label">Top pressure ride</span>
            <strong>{hottestZone.topRide}</strong>
          </div>
        </div>
      )}

      {lastRefreshed && (
        <p className="muted">Last refreshed from CastleWatch: {lastRefreshed}</p>
      )}

      {zones.length > 0 ? (
        <div className="heat-grid live-heat-grid">
          {zones.map((zone) => (
            <div className={`zone ${pressureClass(zone.pressure)}`} key={`${zone.park}-${zone.land}`}>
              <div className="zone-header">
                <strong>{zone.land}</strong>
                <span className="wait-pill">{zone.pressure}</span>
              </div>
              <p>
                Avg {zone.averageWait} min · Peak {zone.longestWait} min · {zone.openRides.length}/{zone.rides.length} open
              </p>
              <p className="muted">Highest pressure: {zone.topRide}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">
          {result?.error || "No heat-map zones available yet. Refresh rides first, then reload the heat map."}
        </p>
      )}

      {result?.url && (
        <p className="muted">
          Source: <span className="code">{result.url}</span>
        </p>
      )}

      <button className="button" onClick={loadHeatMap}>
        Refresh heat map
      </button>
    </div>
  );
}
