"use client";

import { useEffect, useMemo, useState } from "react";
import FamilyTripDeviceCredentialDiagnostic from "./FamilyTripDeviceCredentialDiagnostic";
import FamilyTripDevices from "./FamilyTripDevices";
import FamilyTripHistory from "./FamilyTripHistory";
import FamilyTripSync from "./FamilyTripSync";
import OperationsLink from "./OperationsLink";
import TripWeekDecisionCard, { TripWeekScenarioChange } from "./TripWeekDecisionCard";
import type { SpecialEventIntelligenceData } from "./SpecialEventIntelligence";
import {
  DEFAULT_TRIP_PROFILE,
  TripProfile,
  TripReservation,
  loadReservations,
  loadTripProfile,
} from "../lib/tripProfile";
import {
  DEFAULT_RESORT_PLAN,
  ResortPlan,
  loadResortPlan,
} from "../lib/tripResorts";
import {
  DecisionDay,
  buildTripWeekDecision,
} from "../lib/tripDecisionEngine";
import type {
  TripWeekApprovalState,
  TripWeekScenarioId,
} from "../lib/tripWeekApproval";
import {
  LIGHTNING_LANE_STORAGE_KEY,
  parseLightningLanes,
  type LightningLane,
} from "../lib/lightningLane";
import {
  loadTripWeatherSnapshot,
  type TripWeatherSnapshot,
} from "../lib/weatherReliability";

type PlanDay = DecisionDay & {
  type?: string;
  title?: string;
};

type AlternateDay = DecisionDay & {
  park: string;
  date: string;
};

type Props = {
  plan: {
    days: PlanDay[];
    alternate_swap?: { days?: AlternateDay[] };
    special_event_intelligence?: SpecialEventIntelligenceData;
  };
  approval: TripWeekApprovalState;
  onApplyScenario: (scenario: TripWeekScenarioId) => void;
  onUndo: () => void;
  onLockChange: (locked: boolean) => void;
};

function snapshotKey(
  profile: TripProfile,
  reservations: TripReservation[],
  resorts: ResortPlan,
  weather: TripWeatherSnapshot,
  lightningLanes: LightningLane[],
) {
  return JSON.stringify({ profile, reservations, resorts, weather, lightningLanes });
}

function loadSnapshot() {
  return {
    profile: loadTripProfile(),
    reservations: loadReservations(),
    resorts: loadResortPlan(),
    weather: loadTripWeatherSnapshot(window.localStorage),
    lightningLanes: parseLightningLanes(window.localStorage.getItem(LIGHTNING_LANE_STORAGE_KEY)),
  };
}

function alternateDecisionDays(baseDays: PlanDay[], replacements: AlternateDay[]) {
  const replacementMap = new Map(replacements.map((day) => [day.date, day]));
  return baseDays
    .filter((day) => day.type === "park" && day.park)
    .map((day) => replacementMap.get(day.date) || day);
}

function scenarioAssignments(days: DecisionDay[]) {
  const assignments = new Map<string, string>();
  for (const day of days) {
    if (day.date && day.park) assignments.set(day.date, day.park);
  }
  return assignments;
}

function buildScenarioChanges(
  activeScenario: TripWeekScenarioId,
  preferredScenario: TripWeekScenarioId,
  baseDays: DecisionDay[],
  alternateDays: DecisionDay[],
  reservations: TripReservation[],
): TripWeekScenarioChange[] {
  if (activeScenario === preferredScenario) return [];

  const current = scenarioAssignments(activeScenario === "base" ? baseDays : alternateDays);
  const proposed = scenarioAssignments(preferredScenario === "base" ? baseDays : alternateDays);
  const dates = Array.from(new Set([...current.keys(), ...proposed.keys()])).sort();

  return dates.flatMap((date) => {
    const fromPark = current.get(date);
    const toPark = proposed.get(date);
    if (!fromPark || !toPark || fromPark === toPark) return [];

    return [{
      date,
      fromPark,
      toPark,
      reservations: reservations
        .filter((reservation) => reservation.date === date)
        .map((reservation) => ({
          id: reservation.id,
          title: reservation.title,
          time: reservation.time,
          status: reservation.status,
        })),
    }];
  });
}

export default function TripWeekDecisionPanel({
  plan,
  approval,
  onApplyScenario,
  onUndo,
  onLockChange,
}: Props) {
  const [profile, setProfile] = useState<TripProfile>({ ...DEFAULT_TRIP_PROFILE });
  const [reservations, setReservations] = useState<TripReservation[]>([]);
  const [resorts, setResorts] = useState<ResortPlan>({ ...DEFAULT_RESORT_PLAN });
  const [weather, setWeather] = useState<TripWeatherSnapshot | null>(null);
  const [lightningLanes, setLightningLanes] = useState<LightningLane[]>([]);

  useEffect(() => {
    let lastKey = "";

    function refresh() {
      const snapshot = loadSnapshot();
      const nextKey = snapshotKey(
        snapshot.profile,
        snapshot.reservations,
        snapshot.resorts,
        snapshot.weather,
        snapshot.lightningLanes,
      );
      if (nextKey === lastKey) return;
      lastKey = nextKey;
      setProfile(snapshot.profile);
      setReservations(snapshot.reservations);
      setResorts(snapshot.resorts);
      setWeather(snapshot.weather);
      setLightningLanes(snapshot.lightningLanes);
    }

    refresh();
    const interval = window.setInterval(refresh, 750);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const baseDays = useMemo(
    () => plan.days.filter((day) => day.type === "park" && day.park),
    [plan],
  );

  const alternateDays = useMemo(
    () => alternateDecisionDays(baseDays, plan.alternate_swap?.days || []),
    [baseDays, plan.alternate_swap?.days],
  );

  const decision = useMemo(() => buildTripWeekDecision({
    baseDays,
    alternateDays,
    intelligence: plan.special_event_intelligence,
    reservations,
    resortPlan: resorts,
    profile,
    weather,
    lightningLanes,
  }), [baseDays, alternateDays, lightningLanes, plan.special_event_intelligence, profile, reservations, resorts, weather]);

  const changes = useMemo(() => buildScenarioChanges(
    approval.activeScenario,
    decision.preferredScenario,
    baseDays,
    alternateDays,
    reservations,
  ), [approval.activeScenario, decision.preferredScenario, baseDays, alternateDays, reservations]);

  return (
    <>
      <FamilyTripSync />
      <OperationsLink />
      <FamilyTripDevices />
      <FamilyTripDeviceCredentialDiagnostic />
      <FamilyTripHistory />
      <TripWeekDecisionCard
        decision={decision}
        approval={approval}
        changes={changes}
        onApplyScenario={onApplyScenario}
        onUndo={onUndo}
        onLockChange={onLockChange}
      />
    </>
  );
}