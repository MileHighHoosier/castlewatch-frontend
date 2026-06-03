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

type BadgeInput = {
  name: string;
  land?: string;
  wait?: number;
  mode?: PlanMode;
  specialAccess?: boolean;
  closedPark?: boolean;
  avoidsHotZone?: boolean;
  headliner?: boolean;
};

type ScoredRide = {
  ride: DisplayRide;
  score: number;
  opportunity: number;
  reasons: string[];
};

const PARK_ORDER = ["Magic Kingdom", "Epcot", "Hollywood Studios", "Animal Kingdom"];

const MODE_WAIT_LIMITS: Record<PlanMode, number> = {
  aggressive: 60,
  lowStress: 35,
  coolDown: 35,
};

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

const HEADLINER_KEYWORDS = [
  "seven dwarfs",
  "tron",
  "big thunder",
  "jungle cruise",
  "frozen ever after",
  "remy",
  "guardians",
  "slinky dog",
  "rise of the resistance",
  "millennium falcon",
  "runaway railway",
  "avatar flight of passage",
  "kilimanjaro safaris",
  "expedition everest",
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

function modeLabel(mode: PlanMode) {
  if (mode === "aggressive") return "Max rides";
  if (mode === "coolDown") return "Cool down";
  return "Low-stress";
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

function isHeadlinerRide(value: Pick<DisplayRide, "displayName" | "displayLand"> | Pick<RideInsight, "name" | "land">) {
  const name = "displayName" in value ? value.displayName : value.name;
  const land = "displayLand" in value ? value.displayLand : value.land || "";
  return includesAny(`${name} ${land}`, HEADLINER_KEYWORDS);
}

function isCoolDownRide(ride: Pick<DisplayRide, "displayName" | "displayLand">) {
  return includesAny(`${ride.displayName} ${ride.displayLand}`, COOL_DOWN_KEYWORDS);
}

function getRecommendationBadges(input: BadgeInput) {
  const badges: string[] = [];
  const combined = `${input.name} ${input.land || ""}`;
  const modeLimit = input.mode ? MODE_WAIT_LIMITS[input.mode] : undefined;
  const isLongWait = typeof input.wait === "number" && input.wait >= 45;
  const exceedsModeLimit = typeof input.wait === "number" && typeof modeLimit === "number" && input.wait > modeLimit;

  if (input.specialAccess) badges.push("Check access");
  if (input.closedPark) badges.push("Tomorrow target");
  if (input.mode === "aggressive") badges.push("Max rides");
  if (input.mode === "lowStress") badges.push("Low-stress");
  if (input.mode === "coolDown" || includesAny(combined, COOL_DOWN_KEYWORDS)) badges.push("Cool-down");
  if (input.avoidsHotZone) badges.push("Avoids hot zone");
  if (exceedsModeLimit || isLongWait) badges.push("Long wait");
  if (input.headliner && exceedsModeLimit) badges.push("Headliner exception");
  if (input.mode === "lowStress" && exceedsModeLimit) badges.push("Not low-stress");
  if (typeof input.wait === "number" && input.wait >= 0 && input.wait <= 15) badges.push("Low wait");
  if (typeof input.wait === "number" && input.wait >= 45) badges.push("High demand");
  if (!input.specialAccess && !input.headliner) badges.push("Family target");

  return Array.from(new Set(badges)).slice(0, 4);
}

function getWhyChosenSentence(input: BadgeInput) {
  const wait = input.wait;
  const hasWait = typeof wait === "number" && wait >= 0;
  const mode = input.mode || "lowStress";
  const combined = `${input.name} ${input.land || ""}`;
  const coolDown = includesAny(combined, COOL_DOWN_KEYWORDS);
  const overLimit = hasWait && wait > MODE_WAIT_LIMITS[mode];

  if (overLimit && input.headliner) {
    return "Chosen only as a fallback because all better mode-fit options are above the wait cap.";
  }

  if (mode === "lowStress") {
    if (hasWait && wait <= 15) return "Chosen because it is a short-wait family option that keeps the day easier.";
    if (input.avoidsHotZone) return "Chosen because it fits low-stress mode and avoids the hottest ride area.";
    return "Chosen because it is the best low-stress option available right now.";
  }

  if (mode === "coolDown") {
    if (coolDown) return "Chosen because it works as a lower-effort reset option for the family.";
    return "Chosen because better cool-down options are limited right now.";
  }

  if (hasWait && wait <= 20 && input.headliner) {
    return "Chosen because it is a high-value family ride with a very short wait.";
  }

  if (input.headliner) {
    return "Chosen because it has strong ride value for the current wait and plan mode.";
  }

  return "Chosen because it has the best mix of wait time, family fit, and current park conditions.";
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

function findMatchingRide(insight: RideInsight, parkRides: DisplayRide[]) {
  const insightName = insight.name.toLowerCase();
  return parkRides.find((ride) => ride.displayName.toLowerCase() === insightName)
    || parkRides.find((ride) => ride.displayName.toLowerCase().includes(insightName) || insightName.includes(ride.displayName.toLowerCase()));
}

function historicalOpportunityForRide(ride: DisplayRide, insights?: HistoricalInsights | null) {
  if (!insights) return 0;
  const allInsights = [...(insights.best_now || []), ...(insights.reliable_low_wait || [])].filter(isUsableInsight);
  const match = allInsights.find((insight) => findMatchingRide(insight, [ride]));
  if (!match) return 0;

  if (typeof match.opportunity_score === "number" && match.opportunity_score > 0) {
    return Math.min(match.opportunity_score, 20);
  }

  if (typeof match.typical_wait === "number" && ride.displayWait >= 0) {
    return Math.max(0, Math.min(match.typical_wait - ride.displayWait, 20));
  }

  return 0;
}

function isWithinModeWaitLimit(wait: number | undefined, mode: PlanMode) {
  return typeof wait === "number" && wait >= 0 && wait <= MODE_WAIT_LIMITS[mode];
}

function scoreRideForMode(ride: DisplayRide, mode: PlanMode, hottestZone?: HeatZone, insights?: HistoricalInsights | null): ScoredRide {
  const wait = Math.max(ride.displayWait, 0);
  const waitLimit = MODE_WAIT_LIMITS[mode];
  const headliner = isHeadlinerRide(ride);
  const specialAccess = isSpecialAccessRide(ride);
  const coolDown = isCoolDownRide(ride);
  const inHotZone = hottestZone?.land === ride.displayLand;
  const opportunity = historicalOpportunityForRide(ride, insights);
  const ropeRank = getRopeDropRank(ride);
  const reasons: string[] = [];
  let score = 100;

  score += opportunity;
  if (opportunity > 0) reasons.push("better than usual");

  if (mode === "aggressive") {
    score += headliner ? 22 : 8;
    score += ropeRank < 999 ? Math.max(0, 16 - ropeRank * 2) : 0;
    score -= wait * 1.25;
    if (wait > waitLimit) {
      score -= (wait - waitLimit) * 4;
      reasons.push("over max-rides wait cap");
    }
    if (specialAccess) score -= 10;
  }

  if (mode === "lowStress") {
    score -= wait * 2.2;
    if (headliner) score -= 12;
    if (specialAccess) score -= 25;
    if (inHotZone) score -= 20;
    if (coolDown) score += 8;
    if (wait > waitLimit) {
      score -= 180 + (wait - waitLimit) * 4;
      reasons.push("over low-stress wait cap");
    }
  }

  if (mode === "coolDown") {
    score -= wait * 2;
    score += coolDown ? 35 : -25;
    if (headliner) score -= 18;
    if (specialAccess) score -= 25;
    if (inHotZone) score -= 10;
    if (wait > waitLimit) {
      score -= 140 + (wait - waitLimit) * 3;
      reasons.push("over cool-down wait cap");
    }
  }

  if (wait <= 15) reasons.push("low wait");
  if (headliner) reasons.push("high-value ride");
  if (coolDown) reasons.push("cool-down friendly");
  if (inHotZone) reasons.push("hot-zone penalty");
  if (specialAccess) reasons.push("access rules needed");

  return { ride, score, opportunity, reasons };
}

function getScoredCandidates(openCandidates: DisplayRide[], mode: PlanMode, hottestZone?: HeatZone, insights?: HistoricalInsights | null) {
  return openCandidates
    .map((ride) => scoreRideForMode(ride, mode, hottestZone, insights))
    .sort((a, b) => b.score - a.score || compareOpenThenWaitAsc(a.ride, b.ride));
}

function pickPlanRecommendation(mode: PlanMode, parkRides: DisplayRide[], hottestZone?: HeatZone, insights?: HistoricalInsights | null): PlanRecommendation {
  const openCandidates = parkRides.filter((ride) => isOpenRide(ride) && ride.displayWait >= 0).sort(compareOpenThenWaitAsc);
  const label = modeLabel(mode);
  const waitLimit = MODE_WAIT_LIMITS[mode];

  if (!openCandidates.length) {
    return {
      title: "No priority ride to recommend yet",
      subtitle: "No plan yet",
      reason: "Open ride-demand targets are not available yet.",
      steps: ["Refresh after park opening.", "Use Rides to confirm open targets.", "Use Heat once waits appear."],
    };
  }

  const scoredCandidates = getScoredCandidates(openCandidates, mode, hottestZone, insights);
  const preferred = scoredCandidates.find((candidate) => isWithinModeWaitLimit(candidate.ride.displayWait, mode));
  const fallback = preferred || scoredCandidates[0];
  const pick = fallback.ride;
  const overLimit = !isWithinModeWaitLimit(pick.displayWait, mode);
  const reasonDetails = fallback.reasons.slice(0, 3).join(" · ");

  if (!overLimit) {
    return {
      title: pick.displayName,
      subtitle: `Next move · ${label}`,
      reason: `${pick.displayWait} min wait in ${pick.displayLand}. Live score ${Math.round(fallback.score)}. ${reasonDetails || `Under the ${label} wait cap of ${waitLimit} min.`}`,
      steps: [`Go to ${pick.displayName}.`, "Refresh after this attraction.", "Recalculate before crossing the park."],
      avoid: hottestZone?.land,
    };
  }

  const isHeadlinerFallback = isHeadlinerRide(pick);
  return {
    title: pick.displayName,
    subtitle: isHeadlinerFallback ? `Headliner exception · ${label}` : `Threshold exceeded · ${label}`,
    reason: `No ${label} option is under the ${waitLimit} min cap. Live score ${Math.round(fallback.score)}. This is a fallback, not an ideal ${label} recommendation.`,
    steps: [
      mode === "lowStress" ? `Skip ${pick.displayName} for now unless your group really wants it.` : `Consider ${pick.displayName} only if your group accepts the long wait.`,
      "Refresh before committing.",
      "Check the Rides tab for a shorter option.",
    ],
    avoid: hottestZone?.land,
  };
}

function BadgeRow({ badges }: { badges: string[] }) {
  if (!badges.length) return null;
  return (
    <div className="badge-row">
      {badges.map((badge) => <span className="recommendation-badge" key={badge}>{badge}</span>)}
    </div>
  );
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
  const recommendedRide = priorityParkRides.find((ride) => ride.displayName === planRecommendation.title);
  const planBadgeInput = {
    name: planRecommendation.title,
    land: recommendedRide?.displayLand,
    wait: recommendedRide?.displayWait,
    mode: planMode,
    specialAccess: recommendedRide ? isSpecialAccessRide(recommendedRide) : includesAny(planRecommendation.title, SPECIAL_ACCESS_KEYWORDS),
    avoidsHotZone: Boolean(planRecommendation.avoid),
    headliner: recommendedRide ? isHeadlinerRide(recommendedRide) : includesAny(planRecommendation.title, HEADLINER_KEYWORDS),
  };
  const planBadges = getRecommendationBadges(planBadgeInput);
  const planWhyChosen = getWhyChosenSentence(planBadgeInput);

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
                  const badges = getRecommendationBadges({
                    name: ride.displayName,
                    land: ride.displayLand,
                    wait: ride.displayWait,
                    specialAccess,
                    closedPark: true,
                    headliner: isHeadlinerRide(ride),
                  });
                  return (
                    <div className="plan-step" key={`${ride.displayName}-tomorrow-${index}`}>
                      <span>{index + 1}</span>
                      <p>
                        <strong>{ride.displayName}</strong><br />
                        <BadgeRow badges={badges} />
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
                <BadgeRow badges={planBadges} />
                <p className="muted"><strong>Why chosen:</strong> {planWhyChosen}</p>
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
