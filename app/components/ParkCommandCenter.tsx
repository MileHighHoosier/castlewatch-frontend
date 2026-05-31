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

type DisplayRide = Ride & {
  displayName: string;
  displayPark: string;
  displayWait: number;
  displayLand: string;
  displayUpdated?: string;
};

type ParkCommandCenterProps = {
  selectedPark: string;
  onSelectPark: (park: string) => void;
};

type HeatZone = {
  land: string;
  rides: DisplayRide[];
  openRides: DisplayRide[];
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

function normalizeParkName(value?: string) {
  if (!value) return "Unknown Park";

  const normalized = value.trim().toLowerCase();

  if (normalized.includes("magic kingdom")) return "Magic Kingdom";
  if (normalized.includes("epcot")) return "Epcot";
  if (normalized.includes("hollywood")) return "Hollywood Studios";
  if (normalized.includes("animal kingdom")) return "Animal Kingdom";

  return value.trim() || "Unknown Park";
}

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

function waitLevel(wait: number) {
  if (wait >= 60) return "ride-high";
  if (wait >= 35) return "ride-medium";
  if (wait >= 0) return "ride-low";
  return "ride-unknown";
}

export default function ParkCommandCenter({ selectedPark, onSelectPark }: ParkCommandCenterProps) {
  const [result, setResult] = useState<ApiResult<Ride[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState("");
  const [activeTab, setActiveTab] = useState<"rides" | "heat" | "plan">("rides");
  const [selectedLand, setSelectedLand] = useState<string>("");

  async function loadData() {
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
    loadData();
  }, []);

  const rides = useMemo<DisplayRide[]>(() => {
    const raw = Array.isArray(result?.data) ? result.data : [];

    return raw.map((ride, index) => {
      const wait = ride.wait_time ?? ride.wait;
      const name = ride.name || ride.ride_name || ride.attraction || `Ride ${index + 1}`;

      return {
        ...ride,
        displayName: name,
        displayPark: normalizeParkName(ride.park),
        displayWait: typeof wait === "number" ? wait : -1,
        displayLand: ride.land || "Unassigned Area",
        displayUpdated: ride.created_at,
      };
    });
  }, [result]);

  const availableParks = useMemo(() => {
    const parks = Array.from(new Set(rides.map((ride) => ride.displayPark))).filter((park) => park !== "Unknown Park");

    return parks.sort((a, b) => {
      const aIndex = PARK_ORDER.indexOf(a);
      const bIndex = PARK_ORDER.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [rides]);

  useEffect(() => {
    if (!availableParks.length) return;
    if (!availableParks.includes(selectedPark)) {
      onSelectPark(availableParks[0]);
    }
  }, [availableParks, onSelectPark, selectedPark]);

  const activePark = availableParks.includes(selectedPark)
    ? selectedPark
    : availableParks[0] || selectedPark;

  const parkRides = useMemo(() => {
    return rides
      .filter((ride) => ride.displayPark === activePark)
      .sort((a, b) => b.displayWait - a.displayWait);
  }, [activePark, rides]);

  const openRides = parkRides.filter((ride) => ride.is_open !== false);
  const peakWait = openRides.length > 0 ? Math.max(...openRides.map((ride) => Math.max(ride.displayWait, 0))) : 0;

  const zones = useMemo<HeatZone[]>(() => {
    const groups = new Map<string, DisplayRide[]>();

    for (const ride of parkRides) {
      groups.set(ride.displayLand, [...(groups.get(ride.displayLand) || []), ride]);
    }

    return Array.from(groups.entries())
      .map(([land, landRides]) => {
        const landOpenRides = landRides.filter((ride) => ride.is_open !== false);
        const waits = landOpenRides.map((ride) => Math.max(ride.displayWait, 0));
        const longestWait = waits.length ? Math.max(...waits) : 0;
        const averageWait = waits.length
          ? Math.round(waits.reduce((sum, wait) => sum + wait, 0) / waits.length)
          : 0;
        const topRide = landRides.find((ride) => Math.max(ride.displayWait, 0) === longestWait)?.displayName || "No open rides";

        return {
          land,
          rides: landRides,
          openRides: landOpenRides,
          averageWait,
          longestWait,
          topRide,
          pressure: getPressure(averageWait, longestWait),
        };
      })
      .sort((a, b) => b.longestWait - a.longestWait || b.averageWait - a.averageWait);
  }, [parkRides]);

  useEffect(() => {
    if (!zones.length) {
      setSelectedLand("");
      return;
    }

    if (!zones.some((zone) => zone.land === selectedLand)) {
      setSelectedLand(zones[0].land);
    }
  }, [selectedLand, zones]);

  const hottestZone = zones[0];
  const selectedZone = zones.find((zone) => zone.land === selectedLand) || hottestZone;
  const priorityRides = parkRides.slice(0, 8);

  return (
    <div className="card command-center">
      <div className="command-header">
        <div>
          <h2>{activePark}</h2>
          <p className="muted">
            {loading ? "Loading live park data..." : result?.ok ? "Live park snapshot" : "Ride data not ready"}
          </p>
        </div>

        <button className="button" onClick={loadData} type="button">
          Refresh
        </button>
      </div>

      <div className="command-stats">
        <div className="stat-box compact-stat">
          <span className="stat-label">Open</span>
          <strong>{openRides.length}</strong>
        </div>
        <div className="stat-box compact-stat">
          <span className="stat-label">Peak</span>
          <strong>{peakWait}m</strong>
        </div>
        <div className="stat-box compact-stat">
          <span className="stat-label">Hot Area</span>
          <strong>{hottestZone?.land || "—"}</strong>
        </div>
      </div>

      <div className="section-tabs" role="tablist" aria-label="Park dashboard sections">
        <button className={`section-tab ${activeTab === "rides" ? "section-tab-active" : ""}`} onClick={() => setActiveTab("rides")} type="button">
          Rides
        </button>
        <button className={`section-tab ${activeTab === "heat" ? "section-tab-active" : ""}`} onClick={() => setActiveTab("heat")} type="button">
          Heat
        </button>
        <button className={`section-tab ${activeTab === "plan" ? "section-tab-active" : ""}`} onClick={() => setActiveTab("plan")} type="button">
          Plan
        </button>
      </div>

      {lastRefreshed && (
        <p className="muted compact-refresh">Updated: {lastRefreshed}</p>
      )}

      {activeTab === "rides" && (
        <div className="compact-panel">
          <h3>Highest priority rides</h3>
          {priorityRides.length > 0 ? (
            <div className="ride-list compact-ride-list">
              {priorityRides.map((ride, index) => (
                <div className={`ride ${waitLevel(ride.displayWait)}`} key={ride.id || `${ride.displayName}-${index}`}>
                  <div>
                    <strong>{ride.displayName}</strong>
                    <p className="muted">
                      {ride.displayLand} · {ride.is_open === false ? "Closed" : "Open"} · {formatDateTime(ride.displayUpdated)}
                    </p>
                  </div>
                  <div className="wait-pill">
                    {ride.displayWait >= 0 ? `${ride.displayWait} min` : "—"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No ride-demand attractions displayed for this park yet.</p>
          )}
        </div>
      )}

      {activeTab === "heat" && (
        <div className="compact-panel">
          <h3>Area heat map</h3>
          <div className="area-tile-grid">
            {zones.map((zone) => (
              <button
                className={`area-tile ${pressureClass(zone.pressure)} ${selectedZone?.land === zone.land ? "area-tile-active" : ""}`}
                key={zone.land}
                onClick={() => setSelectedLand(zone.land)}
                type="button"
              >
                <strong>{zone.land}</strong>
                <span>{zone.pressure}</span>
                <small>Peak {zone.longestWait}m · Avg {zone.averageWait}m</small>
              </button>
            ))}
          </div>

          {selectedZone && (
            <div className="area-detail-panel">
              <h3>{selectedZone.land} details</h3>
              <p className="muted">Tap an area above to focus only on that part of the park.</p>
              <div className="ride-list compact-ride-list">
                {selectedZone.rides.slice(0, 5).map((ride, index) => (
                  <div className={`ride ${waitLevel(ride.displayWait)}`} key={`${selectedZone.land}-${ride.displayName}-${index}`}>
                    <div>
                      <strong>{ride.displayName}</strong>
                      <p className="muted">{ride.is_open === false ? "Closed" : "Open"}</p>
                    </div>
                    <div className="wait-pill">
                      {ride.displayWait >= 0 ? `${ride.displayWait} min` : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "plan" && (
        <div className="compact-panel">
          <h3>Plan</h3>
          <p className="muted">
            This tab can become your quick action plan: next ride, food break, low-walk option, and return-later alerts.
          </p>
        </div>
      )}

      {result?.url && (
        <p className="muted compact-source">Source: <span className="code">{result.url}</span></p>
      )}
    </div>
  );
}
