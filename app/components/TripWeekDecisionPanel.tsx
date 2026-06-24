"use client";

import { useEffect, useMemo, useState } from "react";
import TripWeekDecisionCard from "./TripWeekDecisionCard";
import type { SpecialEventIntelligenceData, SpecialEventSignal } from "./SpecialEventIntelligence";
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
};

function snapshotKey(profile: TripProfile, reservations: TripReservation[], resorts: ResortPlan) {
  return JSON.stringify({ profile, reservations, resorts });
}

function loadSnapshot() {
  return {
    profile: loadTripProfile(),
    reservations: loadReservations(),
    resorts: loadResortPlan(),
  };
}

function alternateDecisionDays(baseDays: PlanDay[], replacements: AlternateDay[]) {
  const replacementMap = new Map(replacements.map((day) => [day.date, day]));
  return baseDays
    .filter((day) => day.type === "park" && day.park)
    .map((day) => replacementMap.get(day.date) || day);
}

export default function TripWeekDecisionPanel({ plan }: Props) {
  const [profile, setProfile] = useState<TripProfile>({ ...DEFAULT_TRIP_PROFILE });
  const [reservations, setReservations] = useState<TripReservation[]>([]);
  const [resorts, setResorts] = useState<ResortPlan>({ ...DEFAULT_RESORT_PLAN });

  useEffect(() => {
    let lastKey = "";

    function refresh() {
      const snapshot = loadSnapshot();
      const nextKey = snapshotKey(snapshot.profile, snapshot.reservations, snapshot.resorts);
      if (nextKey === lastKey) return;
      lastKey = nextKey;
      setProfile(snapshot.profile);
      setReservations(snapshot.reservations);
      setResorts(snapshot.resorts);
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

  const decision = useMemo(() => {
    const baseDays = plan.days.filter((day) => day.type === "park" && day.park);
    const alternateDays = alternateDecisionDays(baseDays, plan.alternate_swap?.days || []);
    return buildTripWeekDecision({
      baseDays,
      alternateDays,
      intelligence: plan.special_event_intelligence,
      reservations,
      resortPlan: resorts,
      profile,
    });
  }, [plan, profile, reservations, resorts]);

  return <TripWeekDecisionCard decision={decision} />;
}
