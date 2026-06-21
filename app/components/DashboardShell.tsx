"use client";

import { useState } from "react";
import BackendStatus from "./BackendStatus";
import TransportationPlanner from "./TransportationPlanner";
import ParkCommandCenter from "./ParkCommandCenter";
import EmergencyBreakMode from "./EmergencyBreakMode";
import WeatherAwarePlanning from "./WeatherAwarePlanning";
import ShowTimesActivityLayer from "./ShowTimesActivityLayer";
import CharacterMeetLayer from "./CharacterMeetLayer";
import TripWeekPlanner from "./TripWeekPlanner";

const PARKS = [
  { name: "Magic Kingdom", icon: "🏰" },
  { name: "Epcot", icon: "🌐" },
  { name: "Hollywood Studios", icon: "🎬" },
  { name: "Animal Kingdom", icon: "🌳" },
];

type ActiveSection = "park" | "transportation" | "tripWeek";

export default function DashboardShell() {
  const [selectedPark, setSelectedPark] = useState("Magic Kingdom");
  const [activeSection, setActiveSection] = useState<ActiveSection>("park");

  function choosePark(park: string) {
    setSelectedPark(park);
    setActiveSection("park");
  }

  return (
    <main className="page">
      <EmergencyBreakMode />
      <WeatherAwarePlanning />
      <ShowTimesActivityLayer selectedPark={selectedPark} />
      <CharacterMeetLayer selectedPark={selectedPark} />
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
          className={`top-park-button ${activeSection === "tripWeek" ? "top-park-button-active" : ""}`}
          onClick={() => setActiveSection("tripWeek")}
          type="button"
        >
          <span className="top-park-icon" aria-hidden="true">🗓️</span>
          <span className="top-park-label">Trip Week</span>
        </button>

        <button
          className={`top-park-button ${activeSection === "transportation" ? "top-park-button-active" : ""}`}
          onClick={() => setActiveSection("transportation")}
          type="button"
        >
          <span className="top-park-icon" aria-hidden="true">🧭</span>
          <span className="top-park-label">Getting There</span>
        </button>
      </nav>

      <section className="grid">
        {activeSection === "transportation" ? (
          <TransportationPlanner />
        ) : activeSection === "tripWeek" ? (
          <TripWeekPlanner />
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
