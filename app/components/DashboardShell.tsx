"use client";

import { useState } from "react";
import BackendStatus from "./BackendStatus";
import RideDataPanel from "./RideDataPanel";
import HeatMapPreview from "./HeatMapPreview";
import TransportationPlanner from "./TransportationPlanner";

const PARKS = [
  { name: "Magic Kingdom", icon: "🏰" },
  { name: "Epcot", icon: "🌐" },
  { name: "Hollywood Studios", icon: "🎬" },
  { name: "Animal Kingdom", icon: "🌳" },
];

export default function DashboardShell() {
  const [selectedPark, setSelectedPark] = useState("Magic Kingdom");

  return (
    <main className="page">
      <nav className="top-park-banner" aria-label="Choose a Walt Disney World park">
        {PARKS.map((park) => (
          <button
            key={park.name}
            className={`top-park-button ${park.name === selectedPark ? "top-park-button-active" : ""}`}
            onClick={() => setSelectedPark(park.name)}
            type="button"
          >
            <span className="top-park-icon" aria-hidden="true">{park.icon}</span>
            <span className="top-park-label">{park.name}</span>
          </button>
        ))}
      </nav>

      <section className="grid">
        <BackendStatus />
        <TransportationPlanner />
        <RideDataPanel selectedPark={selectedPark} onSelectPark={setSelectedPark} />

        <div className="card third">
          <h3>Current phase</h3>
          <p className="muted">
            Prove the frontend can reliably connect to Railway before adding complicated predictions.
          </p>
        </div>

        <div className="card third">
          <h3>Trip use case</h3>
          <p className="muted">
            Designed for repeated phone checks during a 7-day Disney trip.
          </p>
        </div>

        <div className="card third">
          <h3>Next milestone</h3>
          <p className="muted">
            Add real park areas, wait-time history, transportation routing, and backend-generated demand scores.
          </p>
        </div>

        <HeatMapPreview selectedPark={selectedPark} onSelectPark={setSelectedPark} />
      </section>

      <p className="footer">
        CastleWatch · Frontend on Vercel · Backend on Railway
      </p>
    </main>
  );
}
