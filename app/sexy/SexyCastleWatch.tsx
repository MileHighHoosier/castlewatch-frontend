"use client";

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
  created_at?: string;
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
  opportunity_score?: number;
};

type HistoricalInsights = {
  summary?: string;
  historical_entries_analyzed?: number;
  best_now?: RideInsight[];
  reliable_low_wait?: RideInsight[];
};

type Tab = "rides" | "heat" | "plan";

type Mode = "aggressive" | "lowStress" | "coolDown";

const PARKS = [
  { name: "Magic Kingdom", short: "MK", icon: "🏰" },
  { name: "Epcot", short: "EP", icon: "🌐" },
  { name: "Hollywood Studios", short: "HS", icon: "🎬" },
  { name: "Animal Kingdom", short: "AK", icon: "🌳" },
];

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

export default function SexyCastleWatch() {
  const [selectedPark, setSelectedPark] = useState("Magic Kingdom");
  const [activeTab, setActiveTab] = useState<Tab>("rides");
  const [mode, setMode] = useState<Mode>("lowStress");
  const [ridesResult, setRidesResult] = useState<ApiResult<Ride[]> | null>(null);
  const [insightsResult, setInsightsResult] = useState<ApiResult<HistoricalInsights> | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadData(park = selectedPark) {
    setLoading(true);
    const [rides, insights] = await Promise.all([
      fetchRideData(),
      fetchPlanningInsights(park),
    ]);
    setRidesResult(rides);
    setInsightsResult(insights as ApiResult<HistoricalInsights>);
    setLoading(false);
  }

  useEffect(() => {
    loadData(selectedPark);
  }, [selectedPark]);

  const rides = useMemo<DisplayRide[]>(() => {
    const raw = Array.isArray(ridesResult?.data) ? ridesResult.data : [];
    return raw.map((ride, index) => {
      const wait = ride.wait_time ?? ride.wait;
      const name = ride.name || ride.ride_name || ride.attraction || `Ride ${index + 1}`;
      return {
        ...ride,
        displayName: name,
        displayPark: normalizeParkName(ride.park),
        displayWait: typeof wait === "number" ? wait : 0,
        displayLand: ride.land || "Unassigned Area",
      };
    });
  }, [ridesResult]);

  const parkRides = useMemo(() => {
    return rides
      .filter((ride) => ride.displayPark === selectedPark)
      .sort((a, b) => b.displayWait - a.displayWait);
  }, [rides, selectedPark]);

  const openRides = parkRides.filter((ride) => ride.is_open !== false);
  const peakWait = openRides.length ? Math.max(...openRides.map((ride) => ride.displayWait)) : 0;

  const zones = useMemo(() => {
    const groups = new Map<string, DisplayRide[]>();
    for (const ride of parkRides) {
      groups.set(ride.displayLand, [...(groups.get(ride.displayLand) || []), ride]);
    }
    return Array.from(groups.entries())
      .map(([land, landRides]) => {
        const open = landRides.filter((ride) => ride.is_open !== false);
        const waits = open.map((ride) => ride.displayWait);
        const peak = waits.length ? Math.max(...waits) : 0;
        const avg = waits.length ? Math.round(waits.reduce((sum, wait) => sum + wait, 0) / waits.length) : 0;
        return {
          land,
          avg,
          peak,
          pressure: pressure(avg, peak),
          rides: landRides.sort((a, b) => b.displayWait - a.displayWait),
        };
      })
      .sort((a, b) => b.peak - a.peak || b.avg - a.avg);
  }, [parkRides]);

  const insights = insightsResult?.ok ? insightsResult.data : null;
  const bestInsight = insights?.best_now?.[0] || insights?.reliable_low_wait?.[0];
  const liveLowStress = openRides.filter((ride) => ride.displayLand !== zones[0]?.land).sort((a, b) => a.displayWait - b.displayWait)[0];
  const liveCoolDown = openRides.filter(isCoolDownRide).sort((a, b) => a.displayWait - b.displayWait)[0];
  const liveAggressive = openRides.sort((a, b) => a.displayWait - b.displayWait)[0];
  const fallbackPlan = mode === "aggressive" ? liveAggressive : mode === "coolDown" ? liveCoolDown || liveLowStress || liveAggressive : liveLowStress || liveAggressive;
  const planTitle = bestInsight?.name || fallbackPlan?.displayName || "Refresh park data";
  const planLand = bestInsight?.land || fallbackPlan?.displayLand || "CastleWatch";
  const planWait = typeof bestInsight?.current_wait === "number" ? bestInsight.current_wait : fallbackPlan?.displayWait || 0;
  const planReason = bestInsight
    ? `${planWait} min now vs ${bestInsight.typical_wait ?? "?"} min typical. CastleWatch history sees this as a strong opportunity.`
    : "Using live data while historical recommendations warm up.";

  const hottestZone = zones[0];
  const selectedZone = zones[0];

  return (
    <main className="sexy-page">
      <section className="sexy-shell">
        <header className="sexy-topbar">
          <span className="sexy-sparkle">✦</span>
          <h1>CastleWatch</h1>
          <button className="sexy-icon-button" type="button" onClick={() => loadData(selectedPark)}>
            {loading ? "…" : "↻"}
          </button>
        </header>

        <nav className="sexy-park-row" aria-label="Choose park">
          {PARKS.map((park) => (
            <button
              key={park.name}
              className={`sexy-park ${selectedPark === park.name ? "active" : ""}`}
              onClick={() => setSelectedPark(park.name)}
              type="button"
            >
              <span>{park.icon}</span>
              <strong>{park.short}</strong>
            </button>
          ))}
          <button className="sexy-park" type="button">
            <span>🚝</span>
            <strong>Go</strong>
          </button>
        </nav>

        <section className="sexy-hero">
          <div>
            <h2>{selectedPark}</h2>
            <p>Park Command Center</p>
          </div>
          <div className="sexy-castle" aria-hidden="true">🏰</div>
        </section>

        <section className="sexy-stats">
          <div>
            <span>Open Rides</span>
            <strong>{openRides.length}</strong>
          </div>
          <div>
            <span>Peak Wait</span>
            <strong>{peakWait}<small>m</small></strong>
          </div>
          <div>
            <span>Hottest</span>
            <strong>{hottestZone?.land || "—"}</strong>
          </div>
          <div>
            <span>History</span>
            <strong>{insights?.historical_entries_analyzed || 0}</strong>
          </div>
        </section>

        <section className="sexy-tabs" aria-label="Dashboard tabs">
          <button className={activeTab === "rides" ? "active" : ""} onClick={() => setActiveTab("rides")} type="button">Rides</button>
          <button className={activeTab === "heat" ? "active" : ""} onClick={() => setActiveTab("heat")} type="button">Heat</button>
          <button className={activeTab === "plan" ? "active" : ""} onClick={() => setActiveTab("plan")} type="button">Plan</button>
        </section>

        {activeTab === "rides" && (
          <section className="sexy-list">
            {parkRides.slice(0, 7).map((ride, index) => (
              <article className="sexy-ride" key={`${ride.displayName}-${index}`}>
                <div className="sexy-orb">{index + 1}</div>
                <div>
                  <h3>{ride.displayName}</h3>
                  <p>{ride.displayLand} · {ride.is_open === false ? "Closed" : "Open"}</p>
                </div>
                <span className={waitClass(ride.displayWait)}>{ride.displayWait}<small>m</small></span>
              </article>
            ))}
          </section>
        )}

        {activeTab === "heat" && (
          <section className="sexy-heat">
            <div className="sexy-zone-grid">
              {zones.slice(0, 6).map((zone) => (
                <article className={pressureClass(zone.pressure)} key={zone.land}>
                  <h3>{zone.land}</h3>
                  <strong>{zone.pressure}</strong>
                  <p>Avg {zone.avg}m · Peak {zone.peak}m</p>
                </article>
              ))}
            </div>
            {selectedZone && (
              <article className="sexy-detail-card">
                <span>Hottest Area</span>
                <h3>{selectedZone.land}</h3>
                <p>Peak {selectedZone.peak}m · {selectedZone.pressure} pressure</p>
                {selectedZone.rides.slice(0, 3).map((ride) => (
                  <div className="sexy-mini-row" key={ride.displayName}>
                    <strong>{ride.displayName}</strong>
                    <span>{ride.displayWait}m</span>
                  </div>
                ))}
              </article>
            )}
          </section>
        )}

        {activeTab === "plan" && (
          <section className="sexy-plan">
            <article className="sexy-next-move">
              <span>✦ Next Best Move</span>
              <div className="sexy-plan-main">
                <div>
                  <h3>{planTitle}</h3>
                  <p>{planLand}</p>
                </div>
                <strong>{planWait}<small>m</small></strong>
              </div>
              <p>{planReason}</p>
              <div className="sexy-mode-row">
                <button className={mode === "aggressive" ? "active" : ""} onClick={() => setMode("aggressive")} type="button">⚡ Max</button>
                <button className={mode === "lowStress" ? "active" : ""} onClick={() => setMode("lowStress")} type="button">🌿 Low</button>
                <button className={mode === "coolDown" ? "active" : ""} onClick={() => setMode("coolDown")} type="button">❄️ Cool</button>
              </div>
            </article>

            <article className="sexy-transport-card">
              <span>Free Transportation</span>
              <div className="sexy-route">
                <strong>{hottestZone?.land || "Current Area"}</strong>
                <span>→</span>
                <strong>{planLand}</strong>
              </div>
              <p>Best free option shown when transport rules are available. Current estimate: plan around 10–25 min.</p>
            </article>

            <div className="sexy-step"><b>1</b><p>Go to {planTitle}.</p></div>
            <div className="sexy-step"><b>2</b><p>Refresh CastleWatch after the ride.</p></div>
            <div className="sexy-step"><b>3</b><p>Avoid {hottestZone?.land || "the hottest area"} if pressure stays high.</p></div>
          </section>
        )}

        <footer className="sexy-footer">
          <strong>CastleWatch+</strong>
          <span>Premium look. Same lightweight data flow.</span>
        </footer>
        <p className="sexy-disclaimer">Unofficial personal planning tool. Not affiliated with, endorsed by, or sponsored by Disney. Estimates may be delayed or inaccurate.</p>
      </section>
    </main>
  );
}
