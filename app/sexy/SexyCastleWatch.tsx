"use client";

import "./SexyCastleWatch.module.css";
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
type IconName = "castle" | "globe" | "studio" | "tree" | "transport" | "spark" | "search" | "rides" | "heat" | "plan" | "route";

const PARKS: Array<{ name: string; short: string; label: string; icon: IconName }> = [
  { name: "Magic Kingdom", short: "Magic Kingdom", label: "Magic Kingdom", icon: "castle" },
  { name: "Epcot", short: "Epcot", label: "Epcot", icon: "globe" },
  { name: "Hollywood Studios", short: "Hollywood Studios", label: "Hollywood Studios", icon: "studio" },
  { name: "Animal Kingdom", short: "Animal Kingdom", label: "Animal Kingdom", icon: "tree" },
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

function Icon({ name }: { name: IconName }) {
  if (name === "castle") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M14 54h36V28l-6 4-6-8-6 8-6-8-6 8-6-4v26Z" />
        <path d="M18 24V11l8 5v8M38 24V11l8 5v8M28 27V8l8 5v14" />
        <path d="M27 54V42a5 5 0 0 1 10 0v12" />
      </svg>
    );
  }

  if (name === "globe") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="22" />
        <path d="M10 32h44M32 10c8 8 8 36 0 44M32 10c-8 8-8 36 0 44M16 20c9 5 23 5 32 0M16 44c9-5 23-5 32 0" />
      </svg>
    );
  }

  if (name === "studio") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M12 24h40v28H12zM12 24l6-12h40l-6 12" />
        <path d="M20 12l-6 12M32 12l-6 12M44 12l-6 12" />
      </svg>
    );
  }

  if (name === "tree") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 54V34" />
        <path d="M20 48c-8-1-12-8-8-15-5-7 0-17 9-17 4-9 18-9 22 0 9 0 14 10 9 17 4 7 0 14-8 15H20Z" />
      </svg>
    );
  }

  if (name === "transport") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M12 20h40v24H12zM18 44l-4 8M46 44l4 8" />
        <path d="M18 26h28M20 34h8M36 34h8" />
        <circle cx="22" cy="44" r="3" /><circle cx="42" cy="44" r="3" />
      </svg>
    );
  }

  if (name === "spark") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 6l5 18 18 8-18 8-5 18-5-18-18-8 18-8 5-18Z" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="27" cy="27" r="16" /><path d="M39 39l14 14" />
      </svg>
    );
  }

  if (name === "rides") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M10 46c8-18 19-24 34-24h10" />
        <path d="M16 46h34M20 46a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM46 46a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" />
      </svg>
    );
  }

  if (name === "heat") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M34 8c4 12-8 14 2 25 3-5 8-8 8-16 10 12 8 30-10 35-18-5-21-21-11-32 0 9 5 12 9 13-5-10 1-15 2-25Z" />
      </svg>
    );
  }

  if (name === "plan") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M18 10v8M46 10v8M12 18h40v34H12zM12 28h40" />
        <path d="M22 38h8M36 38h8M22 46h8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M10 32h44M40 18l14 14-14 14" />
    </svg>
  );
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
    ? `${planWait} min now vs ${bestInsight.typical_wait ?? "?"} min typical. Historical data says this is a good window.`
    : "Using live data while historical recommendations warm up.";

  const hottestZone = zones[0];
  const selectedZone = zones[0];
  const averageWait = openRides.length ? Math.round(openRides.reduce((sum, ride) => sum + ride.displayWait, 0) / openRides.length) : 0;

  return (
    <main className="sexy-page">
      <section className="sexy-phone">
        <div className="sexy-statusbar">
          <span>9:41</span>
          <span className="sexy-island" />
          <span>▴ ︎▰</span>
        </div>

        <header className="sexy-topbar">
          <span className="sexy-sparkle"><Icon name="spark" /></span>
          <h1>CastleWatch</h1>
          <button className="sexy-icon-button" type="button" onClick={() => loadData(selectedPark)} aria-label="Refresh data">
            {loading ? "…" : <Icon name="search" />}
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
              <Icon name={park.icon} />
              <strong>{park.label}</strong>
            </button>
          ))}
          <button className="sexy-park" type="button">
            <Icon name="transport" />
            <strong>Transport</strong>
          </button>
        </nav>

        <section className="sexy-hero">
          <div>
            <h2>{selectedPark}</h2>
            <p>{activeTab === "heat" ? "Heat Map" : "Park Command Center"}</p>
          </div>
          <div className="sexy-skyline" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>

        {activeTab === "heat" ? (
          <section className="sexy-stats compact">
            <div><span>Average Wait</span><strong>{averageWait}<small> min</small></strong></div>
            <div><span>Peak Wait</span><strong>{peakWait}<small> min</small></strong></div>
            <div><span>Crowd Pressure</span><strong>{pressure(averageWait, peakWait)}</strong></div>
          </section>
        ) : (
          <section className="sexy-stats">
            <div><Icon name="rides" /><span>Open Rides</span><strong>{openRides.length}</strong></div>
            <div><Icon name="heat" /><span>Peak Wait</span><strong>{peakWait}<small> min</small></strong></div>
            <div><Icon name="spark" /><span>Hottest Area</span><strong>{hottestZone?.land || "—"}</strong></div>
            <div><Icon name="plan" /><span>Historical Samples</span><strong>{insights?.historical_entries_analyzed || 0}</strong></div>
          </section>
        )}

        <section className="sexy-tabs" aria-label="Dashboard tabs">
          <button className={activeTab === "rides" ? "active" : ""} onClick={() => setActiveTab("rides")} type="button"><Icon name="rides" />Rides</button>
          <button className={activeTab === "heat" ? "active" : ""} onClick={() => setActiveTab("heat")} type="button"><Icon name="heat" />Heat</button>
          <button className={activeTab === "plan" ? "active" : ""} onClick={() => setActiveTab("plan")} type="button"><Icon name="plan" />Plan</button>
        </section>

        {activeTab === "rides" && (
          <section className="sexy-list">
            {parkRides.slice(0, 7).map((ride, index) => (
              <article className="sexy-ride" key={`${ride.displayName}-${index}`}>
                <div className={`sexy-thumb thumb-${index % 6}`} />
                <div>
                  <h3>{ride.displayName}</h3>
                  <p>{ride.displayLand}</p>
                </div>
                <span className={waitClass(ride.displayWait)}>{ride.displayWait}<small>min</small></span>
                <span className="sexy-chevron">›</span>
              </article>
            ))}
          </section>
        )}

        {activeTab === "heat" && (
          <section className="sexy-heat">
            <div className="sexy-map-card">
              {zones.slice(0, 5).map((zone, index) => (
                <article className={`${pressureClass(zone.pressure)} map-zone map-zone-${index}`} key={zone.land}>
                  <strong>{zone.land}</strong>
                  <span>Avg {zone.avg} min</span>
                  <span>Peak {zone.peak} min</span>
                  <small>{zone.pressure}</small>
                </article>
              ))}
            </div>
            {selectedZone && (
              <article className="sexy-detail-card hot-detail">
                <div className="sexy-thumb thumb-0" />
                <div>
                  <span>Hottest Area</span>
                  <h3>{selectedZone.land}</h3>
                  <p>Peak {selectedZone.peak} min · {selectedZone.pressure}</p>
                </div>
                {selectedZone.rides.slice(0, 3).map((ride) => (
                  <div className="sexy-mini-row" key={ride.displayName}>
                    <strong>{ride.displayName}</strong>
                    <span>{ride.displayWait} min</span>
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
                <div className="sexy-thumb thumb-1" />
                <div>
                  <h3>{planTitle}</h3>
                  <p>{planLand}</p>
                </div>
                <strong>{planWait}<small>min</small></strong>
              </div>
              <p>{planReason}</p>
              <div className="sexy-mode-row">
                <button className={mode === "aggressive" ? "active" : ""} onClick={() => setMode("aggressive")} type="button">↗ Max Rides</button>
                <button className={mode === "lowStress" ? "active" : ""} onClick={() => setMode("lowStress")} type="button">◆ Low-Stress</button>
                <button className={mode === "coolDown" ? "active" : ""} onClick={() => setMode("coolDown")} type="button">✦ Cool Down</button>
              </div>
            </article>

            <article className="sexy-transport-card">
              <span><Icon name="transport" /> Free Transportation</span>
              <div className="sexy-route">
                <strong>{hottestZone?.land || "Current Area"}</strong>
                <b>→</b>
                <strong>{planLand}</strong>
              </div>
              <p>Best free option shown when transport rules are available. Current estimate: plan around 10–25 min.</p>
              <div className="sexy-step"><b>1</b><p>Go to {planTitle}.</p></div>
              <div className="sexy-step"><b>2</b><p>Refresh CastleWatch after the ride.</p></div>
              <div className="sexy-step"><b>3</b><p>Avoid {hottestZone?.land || "the hottest area"} if pressure stays high.</p></div>
            </article>
          </section>
        )}

        <footer className="sexy-footer">
          <strong>CastleWatch</strong>
          <span>Premium data. Built for planners, not waiters.</span>
        </footer>
        <p className="sexy-disclaimer">Unofficial personal planning tool. Not affiliated with, endorsed by, or sponsored by Disney. Estimates may be delayed or inaccurate.</p>
      </section>
    </main>
  );
}
