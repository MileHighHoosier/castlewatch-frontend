"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchPlanningInsights, fetchRideData, type ApiResult } from "../lib/api";

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

type RideInsight = {
  name: string;
  land?: string;
  current_wait?: number;
  typical_wait?: number;
  opportunity_score?: number;
  is_open?: boolean;
};

type HistoricalInsights = {
  park: string;
  summary?: string;
  historical_entries_analyzed?: number;
  rides_analyzed?: number;
  best_now?: RideInsight[];
  unusually_high?: RideInsight[];
  reliable_low_wait?: RideInsight[];
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
  pressure: "Low" | "Moderate" | "High" | "Very High";
};

type PlanMode = "aggressive" | "lowStress" | "coolDown";

type PlanRecommendation = {
  title: string;
  subtitle: string;
  reason: string;
  steps: string[];
  avoid?: string;
};

const PARK_ORDER = ["Magic Kingdom", "Epcot", "Hollywood Studios", "Animal Kingdom"];

const COOL_DOWN_KEYWORDS = [
  "philharmagic",
  "small world",
  "carousel of progress",
  "laugh floor",
  "living with the land",
  "spaceship earth",
  "american adventure",
  "frozen",
  "soarin",
  "muppet",
  "runaway railway",
  "star tours",
  "navi",
  "avatar",
  "dinosaur",
  "nemo",
  "mermaid",
  "pirates",
  "haunted mansion",
];

const NON_RIDE_PRIORITY_KEYWORDS = [
  "a pirate's adventure",
  "advanced training lab",
  "adventureland treehouse",
  "american heritage gallery",
  "awesome planet",
  "beauty and the beast live",
  "bruce's shark world",
  "canada far and wide",
  "casey jr",
  "cinema",
  "cinéma",
  "circle-vision",
  "cinderella castle",
  "country bear",
  "discovery island trails",
  "enchanted tales with belle",
  "exhibit",
  "gallery",
  "gorilla falls",
  "house of the whispering willows",
  "house of whispering willows",
  "imageworks",
  "impressions de france",
  "indiana jones",
  "inventing the wonders",
  "journey of water",
  "kidcot",
  "lightning mcqueen",
  "little mermaid - a musical adventure",
  "mickey shorts",
  "musical adventure",
  "palais du",
  "play area",
  "playground",
  "project tomorrow",
  "reflections of china",
  "seabase aquarium",
  "sea base aquarium",
  "short film festival",
  "single rider",
  "sing-along",
  "splash 'n' soak",
  "splash n soak",
  "stage",
  "swiss family treehouse",
  "the boneyard",
  "the oasis",
  "tom sawyer island",
  "trail",
  "tree of life",
  "vacation fun",
  "walt disney presents",
  "whispering willows",
  "wilderness explorers",
  "what if labs",
  "zootopia: better zoogether",
];

const SPECIAL_ACCESS_KEYWORDS = ["tron", "guardians"];

const ROPE_DROP_PRIORITY: Record<string, string[]> = {
  "Magic Kingdom": [
    "seven dwarfs",
    "tron",
    "big thunder",
    "jungle cruise",
    "haunted mansion",
    "buzz lightyear",
    "pirates",
    "small world",
    "dumbo",
    "mad tea party",
    "astro orbiter",
  ],
  Epcot: ["frozen ever after", "remy", "guardians", "soarin", "living with the land", "gran fiesta", "mission: space", "figment"],
  "Hollywood Studios": [
    "slinky dog",
    "rise of the resistance",
    "millennium falcon",
    "runaway railway",
    "toy story mania",
    "alien swirling",
    "rock 'n' roller",
    "tower of terror",
    "star tours",
  ],
  "Animal Kingdom": ["avatar flight of passage", "na'vi river journey", "kilimanjaro safaris", "expedition everest", "kali river rapids", "dinosaur"],
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

function formatDateTime(value?: string) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function includesAny(value: string, keywords: string[]) {
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function isOpenRide(ride: Pick<DisplayRide, "is_open">) {
  return ride.is_open !== false;
}

function isPriorityRide(ride: Pick<DisplayRide, "displayName" | "displayLand">) {
  return !includesAny(`${ride.displayName} ${ride.displayLand}`, NON_RIDE_PRIORITY_KEYWORDS);
}

function isSpecialAccessRide(ride: Pick<DisplayRide, "displayName" | "displayLand">) {
  return includesAny(`${ride.displayName} ${ride.displayLand}`, SPECIAL_ACCESS_KEYWORDS);
}

function getRopeDropRank(ride: DisplayRide) {
  const priorities = ROPE_DROP_PRIORITY[ride.displayPark] || [];
  const combined = `${ride.displayName} ${ride.displayLand}`.toLowerCase();
  const index = priorities.findIndex((keyword) => combined.includes(keyword));
  return index === -1 ? 999 : index;
}

function compareRopeDropPriority(a: DisplayRide, b: DisplayRide) {
  const rankDifference = getRopeDropRank(a) - getRopeDropRank(b);
  if (rankDifference !== 0) return rankDifference;
  return Math.max(b.displayWait, 0) - Math.max(a.displayWait, 0) || a.displayName.localeCompare(b.displayName);
}

function compareOpenThenWaitDesc(a: DisplayRide, b: DisplayRide) {
  const aOpen = isOpenRide(a) ? 1 : 0;
  const bOpen = isOpenRide(b) ? 1 : 0;
  if (aOpen !== bOpen) return bOpen - aOpen;
  return Math.max(b.displayWait, 0) - Math.max(a.displayWait, 0);
}

function compareOpenThenWaitAsc(a: DisplayRide, b: DisplayRide) {
  const aOpen = isOpenRide(a) ? 1 : 0;
  const bOpen = isOpenRide(b) ? 1 : 0;
  if (aOpen !== bOpen) return bOpen - aOpen;
  return Math.max(a.displayWait, 0) - Math.max(b.displayWait, 0);
}

function waitLevel(ride: DisplayRide) {
  if (!isOpenRide(ride)) return "ride-unknown";
  if (ride.displayWait >= 60) return "ride-high";
  if (ride.displayWait >= 35) return "ride-medium";
  return "ride-low";
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

function isUsableInsight(ride: RideInsight) {
  if (ride.is_open === false) return false;
  if (typeof ride.current_wait === "number" && ride.current_wait < 0) return false;
  return !includesAny(`${ride.name || ""} ${ride.land || ""}`, NON_RIDE_PRIORITY_KEYWORDS);
}

function pickPlanRecommendation(mode: PlanMode, parkRides: DisplayRide[], hottestZone?: HeatZone, insights?: HistoricalInsights | null): PlanRecommendation {
  const historicalReady = insights && (insights.rides_analyzed || 0) > 0;

  if (historicalReady) {
    const bestNow = (insights?.best_now || []).filter(isUsableInsight);
    const reliableLowWait = (insights?.reliable_low_wait || []).filter(isUsableInsight);
    const pool = mode === "aggressive"
      ? bestNow
      : mode === "coolDown"
        ? [...bestNow, ...reliableLowWait].filter((ride) => includesAny(`${ride.name} ${ride.land || ""}`, COOL_DOWN_KEYWORDS))
        : reliableLowWait.filter((ride) => ride.land !== hottestZone?.land);
    const pick = pool[0] || bestNow[0] || reliableLowWait[0];

    if (pick) {
      const current = typeof pick.current_wait === "number" ? `${pick.current_wait} min now` : "wait unknown";
      const typical = typeof pick.typical_wait === "number" ? `${pick.typical_wait} min typical` : "typical unknown";
      return {
        title: pick.name,
        subtitle: `Next move · ${mode === "aggressive" ? "Max rides" : mode === "coolDown" ? "Cool down" : "Low-stress"}`,
        reason: `${current} vs ${typical}. CastleWatch is comparing current waits against history.`,
        steps: [
          `Go to ${pick.name}.`,
          "Refresh after this attraction.",
          hottestZone ? `Avoid lingering in ${hottestZone.land} if it stays hot.` : "Check Heat before crossing the park.",
        ],
        avoid: hottestZone?.land,
      };
    }
  }

  const openCandidates = parkRides.filter((ride) => isOpenRide(ride) && ride.displayWait >= 0).sort(compareOpenThenWaitAsc);
  if (!openCandidates.length) {
    return {
      title: "No priority ride to recommend yet",
      subtitle: "No plan yet",
      reason: "Open ride-demand targets are not available yet.",
      steps: ["Refresh after park opening.", "Use Rides to confirm open targets.", "Use Heat once waits appear."],
    };
  }

  const hottestLand = hottestZone?.land;
  const lowStressPick = openCandidates.find((ride) => !hottestLand || ride.displayLand !== hottestLand) || openCandidates[0];
  const coolDownPick = openCandidates.find((ride) => includesAny(`${ride.displayName} ${ride.displayLand}`, COOL_DOWN_KEYWORDS)) || lowStressPick;
  const pick = mode === "aggressive" ? openCandidates[0] : mode === "coolDown" ? coolDownPick : lowStressPick;

  return {
    title: pick.displayName,
    subtitle: `Next move · ${mode === "aggressive" ? "Max rides" : mode === "coolDown" ? "Cool down" : "Low-stress"}`,
    reason: `${pick.displayWait} min wait in ${pick.displayLand}.`,
    steps: [`Go to ${pick.displayName}.`, "Refresh after riding.", "Recalculate before crossing the park."],
    avoid: hottestZone?.land,
  };
}

export default function ParkCommandCenter({ selectedPark, onSelectPark }: ParkCommandCenterProps) {
  const [result, setResult] = useState<ApiResult<Ride[]> | null>(null);
  const [insightsResult, setInsightsResult] = useState<ApiResult<HistoricalInsights> | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState("");
  const [activeTab, setActiveTab] = useState<"rides" | "heat" | "plan">("rides");
  const [selectedLand, setSelectedLand] = useState("");
  const [planMode, setPlanMode] = useState<PlanMode>("lowStress");

  async function loadData(park = selectedPark) {
    setLoading(true);
    const [nextRides, nextInsights] = await Promise.all([fetchRideData(), fetchPlanningInsights(park)]);
    setResult(nextRides);
    setInsightsResult(nextInsights as ApiResult<HistoricalInsights>);
    setLastRefreshed(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }));
    setLoading(false);
  }

  useEffect(() => {
    loadData(selectedPark);
  }, [selectedPark]);

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
    return Array.from(new Set(rides.map((ride) => ride.displayPark)))
      .filter((park) => park !== "Unknown Park")
      .sort((a, b) => {
        const aIndex = PARK_ORDER.indexOf(a);
        const bIndex = PARK_ORDER.indexOf(b);
        if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
  }, [rides]);

  useEffect(() => {
    if (availableParks.length && !availableParks.includes(selectedPark)) {
      onSelectPark(availableParks[0]);
    }
  }, [availableParks, onSelectPark, selectedPark]);

  const activePark = availableParks.includes(selectedPark) ? selectedPark : availableParks[0] || selectedPark;
  const parkRides = useMemo(() => rides.filter((ride) => ride.displayPark === activePark).sort(compareOpenThenWaitDesc), [activePark, rides]);
  const priorityParkRides = useMemo(() => parkRides.filter(isPriorityRide), [parkRides]);
  const openRides = priorityParkRides.filter(isOpenRide);
  const peakWait = openRides.length ? Math.max(...openRides.map((ride) => Math.max(ride.displayWait, 0))) : 0;
  const parkAppearsClosed = priorityParkRides.length > 0 && openRides.length === 0;

  const zones = useMemo<HeatZone[]>(() => {
    const groups = new Map<string, DisplayRide[]>();
    for (const ride of priorityParkRides) {
      groups.set(ride.displayLand, [...(groups.get(ride.displayLand) || []), ride]);
    }

    return Array.from(groups.entries()).map(([land, landRides]) => {
      const sortedLandRides = [...landRides].sort(compareOpenThenWaitDesc);
      const landOpenRides = sortedLandRides.filter(isOpenRide);
      const waits = landOpenRides.map((ride) => Math.max(ride.displayWait, 0));
      const longestWait = waits.length ? Math.max(...waits) : 0;
      const averageWait = waits.length ? Math.round(waits.reduce((sum, wait) => sum + wait, 0) / waits.length) : 0;
      return {
        land,
        rides: sortedLandRides,
        openRides: landOpenRides,
        averageWait,
        longestWait,
        pressure: getPressure(averageWait, longestWait),
      };
    }).sort((a, b) => b.openRides.length - a.openRides.length || b.longestWait - a.longestWait || b.averageWait - a.averageWait);
  }, [priorityParkRides]);

  useEffect(() => {
    if (!zones.length) {
      setSelectedLand("");
      return;
    }
    if (!zones.some((zone) => zone.land === selectedLand)) {
      setSelectedLand(zones[0].land);
    }
  }, [selectedLand, zones]);

  const hottestZone = zones.find((zone) => zone.openRides.length > 0) || zones[0];
  const selectedZone = zones.find((zone) => zone.land === selectedLand) || hottestZone;
  const priorityRides = priorityParkRides.slice(0, 8);
  const tomorrowTargets = [...priorityParkRides].sort(compareRopeDropPriority).slice(0, 3);
  const hiddenNonPriorityCount = parkRides.length - priorityParkRides.length;
  const insights = insightsResult?.ok ? insightsResult.data : null;
  const planRecommendation = pickPlanRecommendation(planMode, priorityParkRides, hottestZone, insights);

  return (
    <div className="card command-center">
      <div className="command-header">
        <div>
          <h2>{activePark}</h2>
          <p className="muted">
            {loading ? "Loading live + historical data..." : result?.ok ? parkAppearsClosed ? "Park appears closed — showing tomorrow's ride targets" : "Live ride-demand snapshot" : "Ride data not ready"}
          </p>
        </div>
        <button className="button" onClick={() => loadData(activePark)} type="button">Refresh</button>
      </div>

      <div className="command-stats">
        <div className="stat-box compact-stat"><span className="stat-label">Open rides</span><strong>{openRides.length}</strong></div>
        <div className="stat-box compact-stat"><span className="stat-label">Peak</span><strong>{peakWait}m</strong></div>
        <div className="stat-box compact-stat"><span className="stat-label">History</span><strong>{insights?.historical_entries_analyzed || 0}</strong></div>
      </div>

      <div className="section-tabs" role="tablist" aria-label="Park dashboard sections">
        <button className={`section-tab ${activeTab === "rides" ? "section-tab-active" : ""}`} onClick={() => setActiveTab("rides")} type="button">Rides</button>
        <button className={`section-tab ${activeTab === "heat" ? "section-tab-active" : ""}`} onClick={() => setActiveTab("heat")} type="button">Heat</button>
        <button className={`section-tab ${activeTab === "plan" ? "section-tab-active" : ""}`} onClick={() => setActiveTab("plan")} type="button">Plan</button>
      </div>

      {lastRefreshed && <p className="muted compact-refresh">Updated: {lastRefreshed}</p>}

      {activeTab === "rides" && (
        <div className="compact-panel">
          <h3>{parkAppearsClosed ? "Ride-demand attractions" : "Highest priority ride-demand attractions"}</h3>
          {parkAppearsClosed && <p className="muted">Park appears closed — showing tomorrow's targets.</p>}
          {hiddenNonPriorityCount > 0 && <p className="muted">Filtered out {hiddenNonPriorityCount} walkthroughs, exhibits, play areas, single-rider lines, or scenery-only entries.</p>}
          {priorityRides.length ? (
            <div className="ride-list compact-ride-list">
              {priorityRides.map((ride, index) => (
                <div className={`ride ${waitLevel(ride)}`} key={ride.id || `${ride.displayName}-${index}`}>
                  <div>
                    <strong>{ride.displayName}</strong>
                    <p className="muted">{ride.displayLand} · {isOpenRide(ride) ? "Open" : "Closed - tomorrow target"} · {formatDateTime(ride.displayUpdated)}</p>
                  </div>
                  <div className="wait-pill">{isOpenRide(ride) && ride.displayWait >= 0 ? `${ride.displayWait} min` : "Closed"}</div>
                </div>
              ))}
            </div>
          ) : <p className="muted">No ride-demand attractions displayed for this park yet.</p>}
        </div>
      )}

      {activeTab === "heat" && (
        <div className="compact-panel">
          <h3>Ride-area heat map</h3>
          <p className="muted">Heat pressure ignores walkthroughs, exhibits, play areas, single-rider lines, and scenery-only entries.</p>
          <div className="area-tile-grid">
            {zones.map((zone) => (
              <button className={`area-tile ${pressureClass(zone.pressure)} ${selectedZone?.land === zone.land ? "area-tile-active" : ""}`} key={zone.land} onClick={() => setSelectedLand(zone.land)} type="button">
                <strong>{zone.land}</strong>
                <span>{zone.openRides.length ? zone.pressure : "Closed"}</span>
                <small>{zone.openRides.length} open · Peak {zone.longestWait}m · Avg {zone.averageWait}m</small>
              </button>
            ))}
          </div>

          {selectedZone && (
            <div className="area-detail-panel">
              <h3>{selectedZone.land} details</h3>
              <p className="muted">Open ride-demand attractions are listed first. Closed, single-rider, and non-ride entries are not treated as good family options.</p>
              <div className="ride-list compact-ride-list">
                {selectedZone.rides.slice(0, 5).map((ride, index) => (
                  <div className={`ride ${waitLevel(ride)}`} key={`${selectedZone.land}-${ride.displayName}-${index}`}>
                    <div><strong>{ride.displayName}</strong><p className="muted">{isOpenRide(ride) ? "Open" : "Closed"}</p></div>
                    <div className="wait-pill">{isOpenRide(ride) && ride.displayWait >= 0 ? `${ride.displayWait} min` : "Closed"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "plan" && (
        <div className="compact-panel">
          {parkAppearsClosed ? (
            <>
              <div className="next-move-card">
                <span className="stat-label">Tomorrow planning · Closed park</span>
                <h3>Tomorrow rope-drop / watch targets</h3>
                <p className="muted">Not live “go now” instructions. Sorted by family rope-drop priority; verify after the next refresh.</p>
                {insights && <div className="history-summary"><strong>Historical data used:</strong> {insights.historical_entries_analyzed || 0} samples · {insights.rides_analyzed || 0} rides analyzed</div>}
              </div>

              <div className="plan-steps">
                {tomorrowTargets.length ? tomorrowTargets.map((ride, index) => {
                  const specialAccess = isSpecialAccessRide(ride);
                  return (
                    <div className="plan-step" key={`${ride.displayName}-tomorrow-${index}`}>
                      <span>{index + 1}</span>
                      <p>
                        <strong>{ride.displayName}</strong><br />
                        <strong>{specialAccess ? "High-value target" : "Family rope-drop target"}</strong><br />
                        {specialAccess ? "Check access rules first. Refresh after park opening." : "Refresh after park opening before committing."}
                      </p>
                    </div>
                  );
                }) : (
                  <div className="plan-step"><span>1</span><p>Refresh tomorrow after park opening to build the first live route.</p></div>
                )}
              </div>

              <div className="plan-note"><strong>Night rule:</strong> Do not treat closed rides as current recommendations. Use this tab for tomorrow planning only.</div>
            </>
          ) : (
            <>
              <div className="plan-mode-tabs" role="tablist" aria-label="Choose planning style">
                <button className={`plan-mode ${planMode === "aggressive" ? "plan-mode-active" : ""}`} onClick={() => setPlanMode("aggressive")} type="button"><span>⚡</span><strong>Max rides</strong></button>
                <button className={`plan-mode ${planMode === "lowStress" ? "plan-mode-active" : ""}`} onClick={() => setPlanMode("lowStress")} type="button"><span>😌</span><strong>Low-stress</strong></button>
                <button className={`plan-mode ${planMode === "coolDown" ? "plan-mode-active" : ""}`} onClick={() => setPlanMode("coolDown")} type="button"><span>❄️</span><strong>Cool down</strong></button>
              </div>

              <div className="next-move-card">
                <span className="stat-label">{planRecommendation.subtitle}</span>
                <h3>{planRecommendation.title}</h3>
                <p className="muted">{planRecommendation.reason}</p>
                {insights ? <div className="history-summary"><strong>Historical data used:</strong> {insights.historical_entries_analyzed || 0} samples · {insights.rides_analyzed || 0} rides analyzed</div> : <div className="history-summary">Historical analysis is warming up. Refresh `/api/refresh-rides` over time to build a stronger dataset.</div>}
                <div className="next-move-actions"><button className="button" type="button">Start route</button><button className="button secondary-button" type="button" onClick={() => loadData(activePark)}>Recalculate</button></div>
              </div>

              <div className="plan-steps">
                {planRecommendation.steps.map((step, index) => <div className="plan-step" key={step}><span>{index + 1}</span><p>{step}</p></div>)}
              </div>
              {planRecommendation.avoid && <div className="plan-note"><strong>Avoid for now:</strong> {planRecommendation.avoid}</div>}
              {insights?.unusually_high && insights.unusually_high.length > 0 && <div className="plan-note"><strong>Busier than usual:</strong> {insights.unusually_high.slice(0, 3).map((ride) => ride.name).join(", ")}</div>}
            </>
          )}
        </div>
      )}

      {result?.url && <p className="muted compact-source">Source: <span className="code">{result.url}</span></p>}
    </div>
  );
}
