"use client";

import { useState } from "react";
import BackendStatus from "./BackendStatus";
import TransportationPlanner from "./TransportationPlanner";
import ParkCommandCenter from "./ParkCommandCenter";
import EmergencyBreakMode from "./EmergencyBreakMode";
import WeatherAwarePlanning from "./WeatherAwarePlanning";

const PARKS = [
  { name: "Magic Kingdom", icon: "🏰" },
  { name: "Epcot", icon: "🌐" },
  { name: "Hollywood Studios", icon: "🎬" },
  { name: "Animal Kingdom", icon: "🌳" },
];

export default function DashboardShell() {
  const [selectedPark, setSelectedPark] = useState("Magic Kingdom");
  const [activeSection, setActiveSection] = useState<"park" | "transportation">("park");

  function choosePark(park: string) {
    setSelectedPark(park);
    setActiveSection("park");
  }

  return (
    <main className="page">
      <EmergencyBreakMode />
      <WeatherAwarePlanning />
      <nav className="top-park-banner" aria-label="Choose a CastleWatch section">
        {PARKS.map((park) => (
          <button
            key={park.name}
            className={`top-park-button ${activeSection === "park" && park.name === selectedPark ? "top-park-button-active" : ""}`}
            onClick={() => choosePark(park.name)}
            type="button"
          >
            <span className="top-park-icon" aria-hidden="true">{park.icon}</span>
            <span className="top-park-label">{park.name}</span>
          </button>
        ))}

        <button
          className={`top-park-button ${activeSection === "transportation" ? "top-park-button-active" : ""}`}
          onClick={() => setActiveSection("transportation")}
          type="button"
        >
          <span className="top-park-icon" aria-hidden="true">🚍</span>
          <span className="top-park-label">Transport</span>
        </button>
      </nav>

      <section className="grid">
        {activeSection === "transportation" ? (
          <TransportationPlanner />
        ) : (
          <ParkCommandCenter selectedPark={selectedPark} onSelectPark={setSelectedPark} />
        )}

        <BackendStatus />
      </section>

      <p className="footer">
        CastleWatch · Frontend on Vercel · Backend on Railway
      </p>
      <p className="disclaimer">
        Unofficial personal planning tool. Not affiliated with, endorsed by, or sponsored by Disney. Estimates may be delayed or inaccurate.
      </p>
    </main>
  );
}
