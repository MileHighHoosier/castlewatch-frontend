"use client";

import styles from "./SexyCastleWatch.module.css";
import { useEffect, useMemo, useState } from "react";
import { fetchPlanningInsights, fetchRideData, type ApiResult } from "../lib/api";

type Ride = {
  name?: string;
  ride_name?: string;
  attraction?: string;
  wait_time?: number;
  wait?: number;
  is_open?: boolean;
  land?: string;
  park?: string;
};

type DisplayRide = Ride & {
  displayName: string;
  displayPark: string;
  displayWait: number;
  displayLand: string;
};

type RideInsight = {
  name: string;
  land?: string;
  current_wait?: number;
  typical_wait?: number;
};

type HistoricalInsights = {
  historical_entries_analyzed?: number;
  best_now?: RideInsight[];
  reliable_low_wait?: RideInsight[];
};

type Tab = "rides" | "heat" | "plan";
type Section = "park" | "transport";
type Mode = "aggressive" | "lowStress" | "coolDown";
type IconName = "castle" | "globe" | "studio" | "tree" | "transport" | "spark" | "search" | "rides" | "heat" | "plan";

const PARKS: Array<{ name: string; label: string; icon: IconName }> = [
  { name: "Magic Kingdom", label: "Magic Kingdom", icon: "castle" },
  { name: "Epcot", label: "Epcot", icon: "globe" },
  { name: "Hollywood Studios", label: "Hollywood Studios", icon: "studio" },
  { name: "Animal Kingdom", label: "Animal Kingdom", icon: "tree" },
];

const PARK_NAMES = ["Magic Kingdom", "Epcot", "Hollywood Studios", "Animal Kingdom"];

const RESORTS = [
  "Value Resort",
  "Contemporary Resort",
  "Polynesian Resort",
  "Grand Floridian Resort",
  "Beach Club Resort",
  "BoardWalk Resort",
  "Animal Kingdom Lodge",
  "Pop Century Resort",
  "Art of Animation Resort",
  "Riviera Resort",
];

const TRANSPORT_LOCATIONS = [...PARK_NAMES, "Transportation Hub", ...RESORTS];

const COOL_DOWN_KEYWORDS = [
  "philharmagic",
  "small world",
  "carousel",
  "laugh floor",
  "living with the land",
  "spaceship earth",
  "muppet",
  "star tours",
  "navi",
  "pirates",
  "haunted mansion",
  "peoplemover",
  "progress",
  "frozen sing",
];

function Icon({ name }: { name: IconName }) {
  if (name === "castle") return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 54h36V28l-6 4-6-8-6 8-6-8-6 8-6-4v26Z" /><path d="M18 24V11l8 5v8M38 24V11l8 5v8M28 27V8l8 5v14" /><path d="M27 54V42a5 5 0 0 1 10 0v12" /></svg>;
  if (name === "globe") return <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22" /><path d="M10 32h44M32 10c8 8 8 36 0 44M32 10c-8 8-8 36 0 44M16 20c9 5 23 5 32 0M16 44c9-5 23-5 32 0" /></svg>;
  if (name === "studio") return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 24h40v28H12zM12 24l6-12h40l-6 12" /><path d="M20 12l-6 12M32 12l-6 12M44 12l-6 12" /></svg>;
  if (name === "tree") return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 54V34" /><path d="M20 48c-8-1-12-8-8-15-5-7 0-17 9-17 4-9 18-9 22 0 9 0 14 10 9 17 4 7 0 14-8 15H20Z" /></svg>;
  if (name === "transport") return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 20h40v24H12zM18 44l-4 8M46 44l4 8" /><path d="M18 26h28M20 34h8M36 34h8" /><circle cx="22" cy="44" r="3" /><circle cx="42" cy="44" r="3" /></svg>;
  if (name === "spark") return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6l5 18 18 8-18 8-5 18-5-18-18-8 18-8 5-18Z" /></svg>;
  if (name === "search") return <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="27" cy="27" r="16" /><path d="M39 39l14 14" /></svg>;
  if (name === "rides") return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 46c8-18 19-24 34-24h10" /><path d="M16 46h34M20 46a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM46 46a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" /></svg>;
  if (name === "heat") return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M34 8c4 12-8 14 2 25 3-5 8-8 8-16 10 12 8 30-10 35-18-5-21-21-11-32 0 9 5 12 9 13-5-10 1-15 2-25Z" /></svg>;
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 10v8M46 10v8M12 18h40v34H12zM12 28h40" /><path d="M22 38h8M36 38h8M22 46h8" /></svg>;
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

function waitClass(wait: number) {
  if (wait >= 60) return "sexy-wait hot";
  if (wait >= 35) return "sexy-wait warm";
  return "sexy-wait cool";
}

function pressure(avg: number, peak: number) {
  if (avg >= 45 || peak >= 80) return "Very High";
  if (avg >= 30 || peak >= 60) return "High";
  if (avg >= 15 || peak >= 35) return "Moderate";
  return "Low";
}

function pressureClass(value: string) {
  if (value === "Very High" || value === "High") return "sexy-zone hot";
  if (value === "Moderate") return "sexy-zone warm";
  return "sexy-zone cool";
}

function isCoolDownRide(ride: DisplayRide) {
  const combined = `${ride.displayName} ${ride.displayLand}`.toLowerCase();
  return COOL_DOWN_KEYWORDS.some((keyword) => combined.includes(keyword));
}

function isSingleRiderEntry(ride: Partial<Ride & DisplayRide>) {
  const combined = `${ride.displayName || ""} ${ride.name || ""} ${ride.ride_name || ""} ${ride.attraction || ""} ${ride.displayLand || ""} ${ride.land || ""}`.toLowerCase();
  return combined.includes("single rider") || combined.includes("single-rider") || combined.includes("single rider lane");
}

function uniqueRides(rides: DisplayRide[]) {
  const seen = new Set<string>();
  return rides.filter((ride) => {
    const key = ride.displayName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function routeAdvice(from: string, to: string) {
  if (from === to) return { method: "Already there", time: "0 min", steps: ["Stay at your current location."] };
  if (from.includes("Value") && to === "Magic Kingdom") return { method: "Bus", time: "35–55 min", steps: ["Be at the resort bus stop 60–75 min before early entry.", "Take the park bus directly to Magic Kingdom.", "Clear security and head to your first land."] };
  if (from.includes("Value") && to === "Epcot") return { method: "Bus or gondola if posted", time: "30–55 min", steps: ["Check the resort sign for the morning route.", "Use bus or gondola service when operating.", "Arrive before early entry if rope dropping."] };
  if (from.includes("Value")) return { method: "Bus", time: "30–60 min", steps: ["Be at the resort bus stop 60–75 min before early entry.", `Take the posted bus toward ${to}.`, "Refresh CastleWatch after entering the park."] };
  if ((from.includes("Beach") || from.includes("BoardWalk")) && to === "Epcot") return { method: "Walk or boat", time: "10–25 min", steps: ["Use the walking path if everyone is ready.", "Boat is easier if you want a slower start.", "Enter through the nearby park entrance."] };
  if ((from.includes("Pop") || from.includes("Art") || from.includes("Riviera")) && (to === "Epcot" || to === "Hollywood Studios")) return { method: "Gondola", time: "20–40 min", steps: ["Arrive at the gondola station early.", "Transfer if needed at the central station.", `Enter ${to} and refresh CastleWatch.`] };
  if ((from.includes("Contemporary") || from.includes("Polynesian") || from.includes("Grand Floridian")) && to === "Magic Kingdom") return { method: "Walk, boat, or resort rail", time: "10–30 min", steps: ["Use the closest posted resort route.", "Walking is usually simplest from the Contemporary.", "Arrive early enough for security and entry."] };
  if (from.includes("Resort") || from.includes("Lodge")) return { method: "Bus or posted resort route", time: "25–60 min", steps: ["Be at the resort transportation area 60–75 min before early entry.", `Use the posted route toward ${to}.`, "Refresh CastleWatch after park entry."] };
  if ((from === "Epcot" && to === "Hollywood Studios") || (from === "Hollywood Studios" && to === "Epcot")) return { method: "Gondola or boat", time: "20–35 min", steps: ["Use gondola service when operating.", "Boat service is another free option."] };
  return { method: "Bus or park transport", time: "30–60 min", steps: ["Use posted free transportation between these locations.", "Confirm route signs before boarding."] };
}

export default function SexyCastleWatch() {
  const [selectedPark, setSelectedPark] = useState("Magic Kingdom");
  const [activeSection, setActiveSection] = useState<Section>("park");
  const [activeTab, setActiveTab] = useState<Tab>("rides");
  const [mode, setMode] = useState<Mode>("lowStress");
  const [from, setFrom] = useState("Magic Kingdom");
  const [to, setTo] = useState("Epcot");
  const [morningResort, setMorningResort] = useState("Value Resort");
  const [morningPark, setMorningPark] = useState("Magic Kingdom");
  const [selectedHeatLand, setSelectedHeatLand] = useState<string | null>(null);
  const [ridesResult, setRidesResult] = useState<ApiResult<Ride[]> | null>(null);
  const [insightsResult, setInsightsResult] = useState<ApiResult<HistoricalInsights> | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadData(park = selectedPark) {
    setLoading(true);
    const [rides, insights] = await Promise.all([fetchRideData(), fetchPlanningInsights(park)]);
    setRidesResult(rides);
    setInsightsResult(insights as ApiResult<HistoricalInsights>);
    setLoading(false);
  }

  useEffect(() => {
    loadData(selectedPark);
    setSelectedHeatLand(null);
    setMorningPark(selectedPark);
  }, [selectedPark]);

  const rides = useMemo<DisplayRide[]>(() => {
    const raw = Array.isArray(ridesResult?.data) ? ridesResult.data : [];
    return raw.map((ride, index) => {
      const wait = ride.wait_time ?? ride.wait;
      const name = ride.name || ride.ride_name || ride.attraction || `Ride ${index + 1}`;
      return { ...ride, displayName: name, displayPark: normalizeParkName(ride.park), displayWait: typeof wait === "number" ? wait : 0, displayLand: ride.land || "Unassigned Area" };
    }).filter((ride) => !isSingleRiderEntry(ride));
  }, [ridesResult]);

  const parkRides = useMemo(() => rides.filter((ride) => ride.displayPark === selectedPark).sort((a, b) => b.displayWait - a.displayWait), [rides, selectedPark]);
  const openRides = parkRides.filter((ride) => ride.is_open !== false);
  const peakWait = openRides.length ? Math.max(...openRides.map((ride) => ride.displayWait)) : 0;

  const zones = useMemo(() => {
    const groups = new Map<string, DisplayRide[]>();
    for (const ride of parkRides) groups.set(ride.displayLand, [...(groups.get(ride.displayLand) || []), ride]);
    return Array.from(groups.entries()).map(([land, landRides]) => {
      const open = landRides.filter((ride) => ride.is_open !== false);
      const waits = open.map((ride) => ride.displayWait);
      const peak = waits.length ? Math.max(...waits) : 0;
      const avg = waits.length ? Math.round(waits.reduce((sum, wait) => sum + wait, 0) / waits.length) : 0;
      return { land, avg, peak, pressure: pressure(avg, peak), rides: landRides.sort((a, b) => b.displayWait - a.displayWait) };
    }).sort((a, b) => b.peak - a.peak || b.avg - a.avg);
  }, [parkRides]);

  const hottestZone = zones[0];
  const selectedZone = zones.find((zone) => zone.land === selectedHeatLand) || hottestZone;
  const insights = insightsResult?.ok ? insightsResult.data : null;
  const bestInsight = insights?.best_now?.[0] || insights?.reliable_low_wait?.[0];
  const averageWait = openRides.length ? Math.round(openRides.reduce((sum, ride) => sum + ride.displayWait, 0) / openRides.length) : 0;
  const route = routeAdvice(from, to);
  const morningRoute = routeAdvice(morningResort, morningPark);

  const aggressivePlan = uniqueRides([...openRides].sort((a, b) => a.displayWait - b.displayWait)).slice(0, 3);
  const lowStressPlan = uniqueRides(openRides.filter((ride) => ride.displayLand !== hottestZone?.land && ride.displayWait <= 45).sort((a, b) => a.displayWait - b.displayWait)).slice(0, 3);
  const coolDownPlan = uniqueRides(openRides.filter(isCoolDownRide).sort((a, b) => a.displayWait - b.displayWait)).slice(0, 3);
  const planRides = mode === "aggressive" ? aggressivePlan : mode === "coolDown" ? (coolDownPlan.length ? coolDownPlan : lowStressPlan.length ? lowStressPlan : aggressivePlan) : (lowStressPlan.length ? lowStressPlan : aggressivePlan);
  const planRide = planRides[0];
  const avoidRide = [...openRides].sort((a, b) => b.displayWait - a.displayWait)[0];
  const watchRide = openRides.filter((ride) => ride.displayWait >= 20 && ride.displayWait <= 55).sort((a, b) => a.displayWait - b.displayWait)[0] || openRides[1];
  const modeCopy = mode === "aggressive"
    ? "Shortest useful waits first. Best when you want the most rides with the least hesitation."
    : mode === "coolDown"
      ? "Prioritizes easier indoor, seated, or recovery-friendly attractions when possible."
      : "Avoids the hottest area and keeps the next move calmer with lower walking pressure.";

  function choosePark(park: string) {
    setSelectedPark(park);
    setSelectedHeatLand(null);
    setMorningPark(park);
    setActiveSection("park");
  }

  return (
    <main className={`sexy-page ${styles.scope}`}>
      <section className="sexy-phone">
        <div className="sexy-statusbar"><span>9:41</span><span className="sexy-island" /><span>▴ ︎▰</span></div>
        <header className="sexy-topbar"><span className="sexy-sparkle"><Icon name="spark" /></span><h1>CastleWatch</h1><button className="sexy-icon-button" type="button" onClick={() => loadData(selectedPark)} aria-label="Refresh data">{loading ? "…" : <Icon name="search" />}</button></header>
        <nav className="sexy-park-row" aria-label="Choose park or transportation">
          {PARKS.map((park) => <button key={park.name} className={`sexy-park ${activeSection === "park" && selectedPark === park.name ? "active" : ""}`} onClick={() => choosePark(park.name)} type="button"><Icon name={park.icon} /><strong>{park.label}</strong></button>)}
          <button className={`sexy-park ${activeSection === "transport" ? "active" : ""}`} onClick={() => setActiveSection("transport")} type="button"><Icon name="transport" /><strong>Transport</strong></button>
        </nav>
        <section className="sexy-hero"><div><h2>{activeSection === "transport" ? "Transport" : selectedPark}</h2><p>{activeSection === "transport" ? "Free Route Planner" : activeTab === "heat" ? "Heat Map" : "Park Command Center"}</p></div><div className="sexy-skyline" aria-hidden="true"><span /><span /><span /></div></section>

        {activeSection === "transport" ? (
          <section className="sexy-transport-screen">
            <article className="sexy-next-move"><span><Icon name="transport" /> Free Transportation</span><div className="sexy-picker-grid"><label><small>Current location</small><select value={from} onChange={(event) => setFrom(event.target.value)}>{TRANSPORT_LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}</select></label><label><small>Destination</small><select value={to} onChange={(event) => setTo(event.target.value)}>{TRANSPORT_LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}</select></label></div><div className="sexy-route"><strong>{from}</strong><b>→</b><strong>{to}</strong></div></article>
            <article className="sexy-transport-card"><span>Recommended free route</span><div className="sexy-plan-main"><div className="sexy-thumb thumb-2" /><div><h3>{route.method}</h3><p>Estimated planning route. Confirm posted signs in person.</p></div><strong>{route.time}</strong></div>{route.steps.map((step, index) => <div className="sexy-step" key={step}><b>{index + 1}</b><p>{step}</p></div>)}</article>
          </section>
        ) : (
          <>
            {activeTab === "heat" ? <section className="sexy-stats compact"><div><span>Average Wait</span><strong>{averageWait}<small> min</small></strong></div><div><span>Peak Wait</span><strong>{peakWait}<small> min</small></strong></div><div><span>Crowd Pressure</span><strong>{pressure(averageWait, peakWait)}</strong></div></section> : <section className="sexy-stats"><div><Icon name="rides" /><span>Open Rides</span><strong>{openRides.length}</strong></div><div><Icon name="heat" /><span>Peak Wait</span><strong>{peakWait}<small> min</small></strong></div><div><Icon name="spark" /><span>Hottest Area</span><strong>{hottestZone?.land || "—"}</strong></div></section>}
            <section className="sexy-tabs" aria-label="Dashboard tabs"><button className={activeTab === "rides" ? "active" : ""} onClick={() => setActiveTab("rides")} type="button"><Icon name="rides" />Rides</button><button className={activeTab === "heat" ? "active" : ""} onClick={() => setActiveTab("heat")} type="button"><Icon name="heat" />Heat</button><button className={activeTab === "plan" ? "active" : ""} onClick={() => setActiveTab("plan")} type="button"><Icon name="plan" />Plan</button></section>
            {activeTab === "rides" && <section className="sexy-list">{parkRides.slice(0, 7).map((ride, index) => <article className="sexy-ride" key={`${ride.displayName}-${index}`}><div className={`sexy-thumb thumb-${index % 6}`} /><div><h3>{ride.displayName}</h3><p>{ride.displayLand}</p></div><span className={waitClass(ride.displayWait)}>{ride.displayWait}<small>min</small></span></article>)}</section>}
            {activeTab === "heat" && <section className="sexy-heat"><div className="sexy-map-card">{zones.slice(0, 5).map((zone, index) => <button key={zone.land} className={`${pressureClass(zone.pressure)} map-zone map-zone-${index} ${selectedZone?.land === zone.land ? "selected" : ""}`} onClick={() => setSelectedHeatLand(zone.land)} type="button" aria-pressed={selectedZone?.land === zone.land}><h3>{zone.land}</h3><strong>{zone.pressure}</strong><span>Avg {zone.avg} min</span><span>Peak {zone.peak} min</span><small>{zone.pressure}</small></button>)}</div>{selectedZone && <article className="sexy-detail-card hot-detail"><div className="sexy-thumb thumb-0" /><div><span>{selectedZone.land === hottestZone?.land ? "Hottest Area" : "Selected Area"}</span><h3>{selectedZone.land}</h3><p>{selectedZone.rides.length} rides · Avg {selectedZone.avg} min · Peak {selectedZone.peak} min · {selectedZone.pressure}</p></div>{selectedZone.rides.map((ride) => <div className="sexy-mini-row" key={ride.displayName}><strong>{ride.displayName}</strong><span>{ride.displayWait} min</span></div>)}</article>}</section>}
            {activeTab === "plan" && <section className="sexy-plan">
              <article className="sexy-next-move"><span>✦ Plan Mode</span><div className="sexy-mode-row"><button className={mode === "aggressive" ? "active" : ""} onClick={() => setMode("aggressive")} type="button">↗ Max Rides</button><button className={mode === "lowStress" ? "active" : ""} onClick={() => setMode("lowStress")} type="button">◆ Low-Stress</button><button className={mode === "coolDown" ? "active" : ""} onClick={() => setMode("coolDown")} type="button">✦ Cool Down</button></div><p>{modeCopy}</p></article>
              <article className="sexy-next-move"><span>✦ Next Best Move</span><div className="sexy-plan-main"><div className="sexy-thumb thumb-1" /><div><h3>{planRide?.displayName || bestInsight?.name || "Refresh park data"}</h3><p>{planRide?.displayLand || bestInsight?.land || selectedPark}</p></div><strong>{planRide?.displayWait ?? bestInsight?.current_wait ?? 0}<small>min</small></strong></div><p>{planRide ? `Chosen for ${mode === "aggressive" ? "short wait efficiency" : mode === "coolDown" ? "recovery-friendly pacing" : "lower stress and lower area pressure"}.` : "Refresh data to build a live recommendation."}</p></article>
              <article className="sexy-transport-card"><span>30-Minute Suggested Order</span>{planRides.length ? planRides.map((ride, index) => <div className="sexy-step" key={`${ride.displayName}-plan`}><b>{index + 1}</b><p>{ride.displayName} · {ride.displayLand} · {ride.displayWait} min</p></div>) : <div className="sexy-step"><b>1</b><p>Refresh CastleWatch to build a plan.</p></div>}</article>
              <article className="sexy-transport-card"><span>Target / Watch / Avoid</span>{planRide && <div className="sexy-mini-row"><strong>Target: {planRide.displayName}</strong><span>{planRide.displayWait} min</span></div>}{watchRide && <div className="sexy-mini-row"><strong>Watch: {watchRide.displayName}</strong><span>{watchRide.displayWait} min</span></div>}{avoidRide && <div className="sexy-mini-row"><strong>Avoid now: {avoidRide.displayName}</strong><span>{avoidRide.displayWait} min</span></div>}</article>
              <article className="sexy-transport-card"><span><Icon name="transport" /> Morning Resort → Park</span><div className="sexy-picker-grid"><label><small>Resort</small><select value={morningResort} onChange={(event) => setMorningResort(event.target.value)}>{RESORTS.map((resort) => <option key={resort} value={resort}>{resort}</option>)}</select></label><label><small>Park</small><select value={morningPark} onChange={(event) => setMorningPark(event.target.value)}>{PARK_NAMES.map((park) => <option key={park} value={park}>{park}</option>)}</select></label></div><div className="sexy-route"><strong>{morningResort}</strong><b>→</b><strong>{morningPark}</strong></div><div className="sexy-plan-main"><div className="sexy-thumb thumb-2" /><div><h3>{morningRoute.method}</h3><p>Morning arrival plan for rope drop or early entry.</p></div><strong>{morningRoute.time}</strong></div>{morningRoute.steps.map((step, index) => <div className="sexy-step" key={`${step}-${index}`}><b>{index + 1}</b><p>{step}</p></div>)}</article>
            </section>}
          </>
        )}
        <footer className="sexy-footer"><strong>CastleWatch</strong><span>Premium data. Built for planners, not waiters.</span></footer>
        <p className="sexy-disclaimer">Unofficial personal planning tool. Not affiliated with, endorsed by, or sponsored by any theme park. Estimates may be delayed or inaccurate.</p>
      </section>
    </main>
  );
}
