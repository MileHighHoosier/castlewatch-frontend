"use client";

import { useEffect, useState } from "react";
import { fetchRideData, type ApiResult } from "../lib/api";

type Ride = {
  id?: string | number;
  name?: string;
  ride_name?: string;
  attraction?: string;
  wait_time?: number;
  wait?: number;
  land?: string;
  park?: string;
};

export default function RideDataPanel() {
  const [result, setResult] = useState<ApiResult<Ride[]> | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadRides() {
    setLoading(true);
    const next = await fetchRideData();
    setResult(next);
    setLoading(false);
  }

  useEffect(() => {
    loadRides();
  }, []);

  const rides = Array.isArray(result?.data) ? result?.data.slice(0, 8) : [];

  return (
    <div className="card half">
      <h2>Ride Data Test</h2>
      <div className="status-row">
        <span className={`dot ${loading ? "warn" : result?.ok ? "good" : "bad"}`} />
        <strong>
          {loading ? "Loading rides..." : result?.ok ? "Ride data loaded" : "Ride endpoint not ready"}
        </strong>
      </div>

      <p className="muted">
        This verifies whether the backend exposes ride or wait-time data in a frontend-friendly format.
      </p>

      {rides && rides.length > 0 ? (
        <div className="ride-list">
          {rides.map((ride, index) => {
            const name = ride.name || ride.ride_name || ride.attraction || `Ride ${index + 1}`;
            const wait = ride.wait_time ?? ride.wait;
            return (
              <div className="ride" key={ride.id || index}>
                <span>{name}</span>
                <strong>{typeof wait === "number" ? `${wait} min` : "—"}</strong>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted">
          {result?.error || "No ride data displayed yet."}
        </p>
      )}

      {result?.url && (
        <p className="muted">
          Last checked: <span className="code">{result.url}</span>
        </p>
      )}

      <button className="button" onClick={loadRides}>
        Reload ride data
      </button>
    </div>
  );
}
