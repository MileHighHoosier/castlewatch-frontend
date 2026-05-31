"use client";

import { useMemo, useState } from "react";

type Location = {
  id: string;
  name: string;
  area: string;
  emoji: string;
};

type RouteResult = {
  method: string;
  time: string;
  steps: string[];
  note?: string;
};

const LOCATIONS: Location[] = [
  { id: "mk", name: "Magic Kingdom", area: "Park", emoji: "🏰" },
  { id: "epcot", name: "Epcot", area: "Park", emoji: "🌐" },
  { id: "hs", name: "Hollywood Studios", area: "Park", emoji: "🎬" },
  { id: "ak", name: "Animal Kingdom", area: "Park", emoji: "🌳" },
  { id: "ttc", name: "Transportation and Ticket Center", area: "Hub", emoji: "🚉" },
  { id: "ds", name: "Disney Springs", area: "Shopping/Dining", emoji: "🛍️" },
  { id: "contemporary", name: "Contemporary Resort", area: "Magic Kingdom Resort", emoji: "🏨" },
  { id: "poly", name: "Polynesian Village Resort", area: "Magic Kingdom Resort", emoji: "🌺" },
  { id: "grand", name: "Grand Floridian Resort", area: "Magic Kingdom Resort", emoji: "🏨" },
  { id: "beach", name: "Beach Club Resort", area: "Epcot Resort", emoji: "🏖️" },
  { id: "boardwalk", name: "BoardWalk Inn", area: "Epcot Resort", emoji: "🎡" },
  { id: "riviera", name: "Riviera Resort", area: "Skyliner Resort", emoji: "🏨" },
  { id: "pop", name: "Pop Century Resort", area: "Skyliner Resort", emoji: "🏨" },
  { id: "art", name: "Art of Animation Resort", area: "Skyliner Resort", emoji: "🎨" },
  { id: "akl", name: "Animal Kingdom Lodge", area: "Animal Kingdom Resort", emoji: "🦒" },
];

const MK_RESORTS = new Set(["contemporary", "poly", "grand"]);
const EPCOT_RESORTS = new Set(["beach", "boardwalk"]);
const SKYLINER_RESORTS = new Set(["riviera", "pop", "art"]);
const PARKS = new Set(["mk", "epcot", "hs", "ak"]);

function locationName(id: string) {
  return LOCATIONS.find((location) => location.id === id)?.name || id;
}

function getRoute(from: string, to: string): RouteResult {
  const fromName = locationName(from);
  const toName = locationName(to);

  if (from === to) {
    return {
      method: "You are already there",
      time: "0 min",
      steps: ["Stay at your current location."],
    };
  }

  if ((from === "epcot" && to === "hs") || (from === "hs" && to === "epcot")) {
    return {
      method: "Disney Skyliner or Friendship Boat",
      time: "20–35 min",
      steps: [
        "Use the Disney Skyliner between Epcot International Gateway and Hollywood Studios.",
        "Friendship Boat is another free option if you prefer less walking.",
      ],
      note: "Skyliner is usually faster, but weather can pause service.",
    };
  }

  if ((from === "mk" && to === "ttc") || (from === "ttc" && to === "mk")) {
    return {
      method: "Monorail or Ferryboat",
      time: "10–20 min",
      steps: [
        "Use the Express Monorail or Ferryboat between Magic Kingdom and the Transportation and Ticket Center.",
      ],
    };
  }

  if (from === "mk" && MK_RESORTS.has(to)) {
    const method = to === "contemporary" ? "Walk or Resort Monorail" : "Resort Monorail or Boat";
    return {
      method,
      time: to === "contemporary" ? "10–20 min" : "15–30 min",
      steps: [
        `Exit Magic Kingdom and use ${method.toLowerCase()} to ${toName}.`,
      ],
    };
  }

  if (MK_RESORTS.has(from) && to === "mk") {
    const method = from === "contemporary" ? "Walk or Resort Monorail" : "Resort Monorail or Boat";
    return {
      method,
      time: from === "contemporary" ? "10–20 min" : "15–30 min",
      steps: [
        `Use ${method.toLowerCase()} from ${fromName} to Magic Kingdom.`,
      ],
    };
  }

  if (from === "epcot" && EPCOT_RESORTS.has(to)) {
    return {
      method: "Walk or Friendship Boat",
      time: "10–20 min",
      steps: [
        `Exit through International Gateway and walk or take a Friendship Boat to ${toName}.`,
      ],
    };
  }

  if (EPCOT_RESORTS.has(from) && to === "epcot") {
    return {
      method: "Walk or Friendship Boat",
      time: "10–20 min",
      steps: [
        `Walk or take a Friendship Boat from ${fromName} to Epcot International Gateway.`,
      ],
    };
  }

  if (from === "hs" && EPCOT_RESORTS.has(to)) {
    return {
      method: "Friendship Boat or Skyliner + walk",
      time: "20–35 min",
      steps: [
        `Take a Friendship Boat toward the Epcot resort area and exit near ${toName}.`,
        "Skyliner to Epcot International Gateway plus a walk can also work.",
      ],
    };
  }

  if (EPCOT_RESORTS.has(from) && to === "hs") {
    return {
      method: "Friendship Boat or Skyliner",
      time: "20–35 min",
      steps: [
        `Take a Friendship Boat from the Epcot resort area to Hollywood Studios, or use the Skyliner from International Gateway.`,
      ],
    };
  }

  if ((from === "epcot" || from === "hs") && SKYLINER_RESORTS.has(to)) {
    return {
      method: "Disney Skyliner",
      time: "15–35 min",
      steps: [
        `Use the Disney Skyliner from ${fromName} toward the appropriate station for ${toName}.`,
        "Transfer at Caribbean Beach if needed.",
      ],
      note: "Skyliner service can pause for weather.",
    };
  }

  if (SKYLINER_RESORTS.has(from) && (to === "epcot" || to === "hs")) {
    return {
      method: "Disney Skyliner",
      time: "15–35 min",
      steps: [
        `Use the Disney Skyliner from ${fromName} toward ${toName}.`,
        "Transfer at Caribbean Beach if needed.",
      ],
      note: "Skyliner service can pause for weather.",
    };
  }

  if ((from === "epcot" && to === "mk") || (from === "mk" && to === "epcot")) {
    return {
      method: "Monorail via Transportation and Ticket Center",
      time: "35–55 min",
      steps: [
        from === "epcot"
          ? "Take the Epcot Monorail to the Transportation and Ticket Center."
          : "Take the Express Monorail or Ferryboat to the Transportation and Ticket Center.",
        from === "epcot"
          ? "Transfer to the Express Monorail or Ferryboat to Magic Kingdom."
          : "Transfer to the Epcot Monorail.",
      ],
    };
  }

  if (from === "ds" || to === "ds") {
    return {
      method: "Disney Bus via resort transfer",
      time: "45–75+ min",
      steps: [
        "Use Disney bus transportation between Disney Springs and a Disney Resort.",
        `Transfer through a nearby resort or your resort to continue to ${toName}.`,
      ],
      note: "Direct park-to-Disney Springs bus routes are limited. A rideshare may be faster, but this shows the free Disney option.",
    };
  }

  if (from === "akl" || to === "akl" || from === "ak" || to === "ak") {
    return {
      method: "Disney Bus",
      time: "20–50 min",
      steps: [
        `Use Disney bus transportation from ${fromName} toward ${toName}.`,
        "For resort-to-resort trips, transfer at a park or Disney Springs if no direct route is posted.",
      ],
    };
  }

  if (PARKS.has(from) && PARKS.has(to)) {
    return {
      method: "Disney Bus or park-specific transport",
      time: "30–60 min",
      steps: [
        `Look for Disney transportation from ${fromName} to ${toName}.`,
        "If a direct bus is not posted, transfer through a nearby hub or resort.",
      ],
    };
  }

  return {
    method: "Disney Bus with possible transfer",
    time: "35–70 min",
    steps: [
      `Use Disney transportation from ${fromName} toward ${toName}.`,
      "For resort-to-resort travel, transfer at a park, Disney Springs, or a major transportation hub.",
    ],
  };
}

export default function TransportationPlanner() {
  const [from, setFrom] = useState("mk");
  const [to, setTo] = useState("epcot");

  const route = useMemo(() => getRoute(from, to), [from, to]);
  const current = LOCATIONS.find((location) => location.id === from);
  const destination = LOCATIONS.find((location) => location.id === to);

  return (
    <div className="card half">
      <h2>Free Disney Transportation</h2>
      <p className="muted">
        Choose where you are and where you want to go. CastleWatch suggests the free Disney transportation path and a rough travel-time range.
      </p>

      <div className="transport-picker-grid">
        <label className="transport-picker">
          <span>Current location</span>
          <select value={from} onChange={(event) => setFrom(event.target.value)}>
            {LOCATIONS.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>

        <label className="transport-picker">
          <span>Destination</span>
          <select value={to} onChange={(event) => setTo(event.target.value)}>
            {LOCATIONS.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="transport-summary">
        <div>
          <span className="stat-label">From</span>
          <strong>{current?.emoji} {current?.name}</strong>
        </div>
        <div>
          <span className="stat-label">To</span>
          <strong>{destination?.emoji} {destination?.name}</strong>
        </div>
      </div>

      <div className="transport-result">
        <span className="stat-label">Recommended free transportation</span>
        <h3>{route.method}</h3>
        <div className="wait-pill">{route.time}</div>

        <ol>
          {route.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>

        {route.note && <p className="muted">Note: {route.note}</p>}
      </div>
    </div>
  );
}
