"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../lib/api";

const STYLE_ID = "castlewatch-getting-there-style";
const TRIP_REQUEST_TIMEOUT_MS = 12_000;

type TripDay = {
  date: string;
  type: string;
  park?: string;
  title: string;
};

type TripWeekPlan = {
  days?: TripDay[];
  alternate_swap?: {
    days?: Array<{ date: string; park: string; title: string }>;
  };
};

type RoutePlan = {
  key: string;
  date: string;
  title: string;
  from: string;
  to: string;
  targetLabel: string;
  defaultTarget: string;
  primary: string;
  boardingLabel: string;
  routeNumber: string;
  publishedSchedule: string;
  travelMin: number;
  travelMax: number;
  walkToStop: number;
  arrivalBuffer: number;
  steps: string[];
  backup: string;
  note?: string;
  busAssist: boolean;
};

type LookupLocation = {
  id: string;
  name: string;
};

const FALLBACK_DAYS: TripDay[] = [
  { date: "2027-10-10", type: "park", park: "Magic Kingdom", title: "Magic Kingdom" },
  { date: "2027-10-11", type: "park", park: "Hollywood Studios", title: "Hollywood Studios" },
  { date: "2027-10-12", type: "rest", title: "Beach Club rest day" },
  { date: "2027-10-13", type: "park", park: "Epcot", title: "Epcot" },
  { date: "2027-10-14", type: "park", park: "Animal Kingdom", title: "Animal Kingdom" },
  { date: "2027-10-15", type: "flex", title: "AKL / private-tour flex day" },
];

const LOOKUP_LOCATIONS: LookupLocation[] = [
  { id: "value", name: "Value Resort" },
  { id: "beach", name: "Beach Club" },
  { id: "mk", name: "Magic Kingdom" },
  { id: "epcot", name: "Epcot" },
  { id: "hs", name: "Hollywood Studios" },
  { id: "ak", name: "Animal Kingdom" },
  { id: "grand", name: "Grand Floridian" },
  { id: "akl", name: "Animal Kingdom Lodge" },
];

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .getting-there-card { grid-column: 1 / -1; }
    .getting-there-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
    .getting-there-header h2, .getting-there-header p { margin-top:0; }
    .getting-there-pill { border:1px solid rgba(99,164,255,.42); border-radius:999px; padding:5px 9px; font-size:11px; font-weight:900; white-space:nowrap; }
    .getting-there-days { display:flex; gap:8px; overflow-x:auto; padding:4px 0 10px; scrollbar-width:none; }
    .getting-there-days::-webkit-scrollbar { display:none; }
    .getting-there-day { flex:0 0 auto; border:1px solid rgba(255,255,255,.13); border-radius:12px; padding:8px 10px; background:rgba(255,255,255,.025); color:inherit; text-align:left; }
    .getting-there-day-active { border-color:rgba(99,164,255,.65); background:rgba(99,164,255,.11); }
    .getting-there-mode { display:flex; gap:8px; margin:2px 0 12px; }
    .getting-there-mode button { flex:1; border:1px solid rgba(255,255,255,.14); border-radius:12px; padding:9px; background:rgba(255,255,255,.025); color:inherit; font-weight:800; }
    .getting-there-mode .active { border-color:rgba(255,184,76,.55); background:rgba(255,184,76,.09); }
    .getting-there-route { border:1px solid rgba(56,217,150,.34); background:rgba(56,217,150,.06); border-radius:18px; padding:14px; }
    .getting-there-route h3, .getting-there-route p { margin-top:0; }
    .getting-there-summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; margin:12px 0; }
    .getting-there-metric { border:1px solid rgba(255,255,255,.11); border-radius:13px; padding:10px; background:rgba(0,0,0,.08); }
    .getting-there-metric span { display:block; color:var(--muted); font-size:11px; font-weight:900; margin-bottom:4px; }
    .getting-there-metric strong { font-size:16px; line-height:1.2; }
    .getting-there-time-input { width:100%; border:1px solid rgba(255,255,255,.16); border-radius:10px; padding:9px 10px; background:rgba(0,0,0,.16); color:inherit; font:inherit; }
    .getting-there-steps { margin:10px 0 0; padding-left:22px; }
    .getting-there-steps li { margin:7px 0; }
    .getting-there-info { display:grid; gap:8px; margin-top:12px; }
    .getting-there-info-row { border:1px solid rgba(255,255,255,.1); border-radius:11px; padding:9px 10px; }
    .getting-there-info-row span { display:block; color:var(--muted); font-size:11px; font-weight:900; margin-bottom:3px; }
    .getting-there-backup { border:1px solid rgba(255,184,76,.35); background:rgba(255,184,76,.07); border-radius:13px; padding:10px; margin-top:12px; }
    .getting-there-bus-assist { border:1px solid rgba(99,164,255,.3); background:rgba(99,164,255,.055); border-radius:15px; padding:12px; margin-top:14px; }
    .getting-there-bus-assist h3, .getting-there-bus-assist p { margin-top:0; }
    .getting-there-status-good { color:rgb(56,217,150); }
    .getting-there-status-risk { color:rgb(255,184,76); }
    .getting-there-lookup { margin-top:14px; border:1px solid rgba(255,255,255,.11); border-radius:14px; padding:10px 12px; }
    .getting-there-lookup summary { cursor:pointer; font-weight:900; }
    .getting-there-lookup-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; margin-top:12px; }
    .getting-there-lookup select { width:100%; border:1px solid rgba(255,255,255,.16); border-radius:10px; padding:9px; background:rgba(0,0,0,.16); color:inherit; }
    @media (max-width:700px) {
      .getting-there-header { flex-direction:column; }
      .getting-there-summary, .getting-there-lookup-grid { grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(style);
}

function formatDay(dateValue: string) {
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function timeFromMinutes(total: number) {
  const normalized = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function makeRoute(date: string, destination: string, alternate: boolean): RoutePlan {
  if (date === "2027-10-10" && alternate) {
    return {
      key: "sun-epcot-alt", date, title: "Sunday alternate: Epcot", from: "Value Resort", to: "Epcot",
      targetLabel: "Desired gate arrival", defaultTarget: "08:00", primary: "Disney bus labeled Epcot",
      boardingLabel: "Epcot", routeNumber: "No public route number — board the bus marked Epcot",
      publishedSchedule: "No fixed public timetable — use the resort display or My Disney Experience",
      travelMin: 20, travelMax: 40, walkToStop: 10, arrivalBuffer: 15,
      steps: ["Leave the room and walk to the resort bus stop.", "Join the queue marked Epcot; do not look for a route number.", "Exit at the Epcot bus plaza, then continue through security and the front entrance."],
      backup: "If no Epcot bus is posted by the leave-by time, use Minnie Van or rideshare.", busAssist: true,
    };
  }

  if (date === "2027-10-10") {
    return {
      key: "sun-mk", date, title: "Sunday: Magic Kingdom", from: "Value Resort", to: "Magic Kingdom",
      targetLabel: "Desired gate arrival", defaultTarget: "08:00", primary: "Disney bus labeled Magic Kingdom",
      boardingLabel: "Magic Kingdom", routeNumber: "No public route number — board the bus marked Magic Kingdom",
      publishedSchedule: "No fixed public timetable — use the resort display or My Disney Experience",
      travelMin: 25, travelMax: 45, walkToStop: 10, arrivalBuffer: 15,
      steps: ["Leave the room and walk to the resort bus stop.", "Join the queue marked Magic Kingdom.", "The bus arrives at the Magic Kingdom bus plaza; no TTC transfer is needed.", "Continue through security and the tapstiles."],
      backup: "If a bus is not posted by the leave-by time, use Minnie Van or rideshare. Recheck the route once 2027 MNSSHP hours are released.",
      note: "This park assignment is provisional because a party night could shorten regular park hours.", busAssist: true,
    };
  }

  if (date === "2027-10-11") {
    return {
      key: "mon-hs", date, title: "Monday: Hollywood Studios", from: "Value Resort", to: "Hollywood Studios",
      targetLabel: "Desired gate arrival", defaultTarget: "08:00", primary: "Disney bus labeled Hollywood Studios",
      boardingLabel: "Hollywood Studios", routeNumber: "No public route number — board the bus marked Hollywood Studios",
      publishedSchedule: "No fixed public timetable — use the resort display or My Disney Experience",
      travelMin: 20, travelMax: 40, walkToStop: 10, arrivalBuffer: 15,
      steps: ["Walk to the resort bus stop.", "Join the Hollywood Studios queue.", "Exit at the Hollywood Studios bus plaza and continue to security."],
      backup: "If staying at Pop Century or Art of Animation and Skyliner is operating, Skyliner may be the better backup. Otherwise use rideshare.", busAssist: true,
    };
  }

  if (date === "2027-10-12") {
    return {
      key: "tue-1900", date, title: "Tuesday: 1900 Park Fare", from: "Beach Club", to: "Grand Floridian",
      targetLabel: "Desired restaurant arrival", defaultTarget: "17:30", primary: "Bus to Magic Kingdom, then Resort Monorail or boat",
      boardingLabel: "Magic Kingdom", routeNumber: "No public route number — first board the bus marked Magic Kingdom",
      publishedSchedule: "No fixed public timetable — allow extra transfer time",
      travelMin: 50, travelMax: 75, walkToStop: 10, arrivalBuffer: 10,
      steps: ["Walk from Beach Club to its bus stop.", "Board the bus labeled Magic Kingdom.", "At Magic Kingdom, follow signs to the Resort Monorail or Grand Floridian boat dock.", "Exit at Grand Floridian and walk to 1900 Park Fare."],
      backup: "For a reservation, Minnie Van or rideshare is the safer backup if the first Magic Kingdom bus is delayed.", busAssist: true,
    };
  }

  if (date === "2027-10-13" && alternate) {
    return {
      key: "wed-mk-alt", date, title: "Wednesday alternate: Magic Kingdom", from: "Beach Club", to: "Magic Kingdom",
      targetLabel: "Desired gate arrival", defaultTarget: "08:00", primary: "Disney bus labeled Magic Kingdom",
      boardingLabel: "Magic Kingdom", routeNumber: "No public route number — board the bus marked Magic Kingdom",
      publishedSchedule: "No fixed public timetable — use the Beach Club display or My Disney Experience",
      travelMin: 25, travelMax: 45, walkToStop: 10, arrivalBuffer: 15,
      steps: ["Walk to the Beach Club bus stop.", "Board the bus labeled Magic Kingdom.", "Exit at the Magic Kingdom bus plaza and continue through security."],
      backup: "Use Minnie Van or rideshare if the alternate Magic Kingdom day creates a hard BBB or dining deadline.", busAssist: true,
    };
  }

  if (date === "2027-10-13") {
    return {
      key: "wed-epcot", date, title: "Wednesday: Epcot", from: "Beach Club", to: "Epcot International Gateway",
      targetLabel: "Desired gate arrival", defaultTarget: "08:00", primary: "Walk to International Gateway",
      boardingLabel: "No vehicle needed", routeNumber: "No route number — use the signed walking path",
      publishedSchedule: "Always available; Friendship Boat is the slower weather-dependent alternative",
      travelMin: 10, travelMax: 20, walkToStop: 5, arrivalBuffer: 15,
      steps: ["Leave the Beach Club lobby toward Crescent Lake.", "Follow the walking path toward Epcot International Gateway.", "Enter through International Gateway rather than the front entrance."],
      backup: "Use the Friendship Boat when operating if walking is undesirable, but leave additional time.", busAssist: false,
    };
  }

  if (date === "2027-10-14") {
    return {
      key: "thu-ak", date, title: "Thursday: Animal Kingdom", from: "Value Resort", to: "Animal Kingdom",
      targetLabel: "Desired gate arrival", defaultTarget: "08:00", primary: "Disney bus labeled Animal Kingdom",
      boardingLabel: "Animal Kingdom", routeNumber: "No public route number — board the bus marked Animal Kingdom",
      publishedSchedule: "No fixed public timetable — use the resort display or My Disney Experience",
      travelMin: 20, travelMax: 40, walkToStop: 10, arrivalBuffer: 15,
      steps: ["Walk to the resort bus stop.", "Join the queue marked Animal Kingdom.", "Exit at the Animal Kingdom bus plaza and continue through security."],
      backup: "Use rideshare if no Animal Kingdom bus is posted by the leave-by time.", busAssist: true,
    };
  }

  return {
    key: "fri-akl", date, title: "Friday: Animal Kingdom Lodge transfer", from: "Value Resort", to: "Animal Kingdom Lodge",
    targetLabel: "Desired AKL arrival", defaultTarget: "15:00", primary: "Bus to Animal Kingdom, then bus to Animal Kingdom Lodge",
    boardingLabel: "Animal Kingdom first", routeNumber: "No public route number — use destination-labeled buses",
    publishedSchedule: "No direct resort-to-resort timetable; this route requires a transfer",
    travelMin: 45, travelMax: 75, walkToStop: 10, arrivalBuffer: 0,
    steps: ["Board the Animal Kingdom bus at the Value Resort.", "At Animal Kingdom, leave the arrival area and locate the resort-bus load zones.", "Board the bus labeled Animal Kingdom Lodge.", "Verify whether you need Jambo House or Kidani Village before boarding."],
    backup: "Use luggage transfer for bags and rideshare for the family; that is usually much simpler than the free two-bus route.", busAssist: true,
  };
}

function quickLookup(from: string, to: string) {
  if (from === to) return "You are already there.";
  if (from === "beach" && to === "epcot") return "Walk to Epcot International Gateway; allow about 15–25 minutes door to gate.";
  if (from === "beach" && to === "grand") return "Bus to Magic Kingdom, then Resort Monorail or boat to Grand Floridian; allow 60–90 minutes.";
  if (from === "value" && ["mk", "epcot", "hs", "ak"].includes(to)) return `Board the destination-labeled Disney bus to ${LOOKUP_LOCATIONS.find((item) => item.id === to)?.name}; no public route number is used.`;
  if (to === "akl") return "Use a park as the transfer point for the free route; rideshare is usually simpler for resort-to-resort travel.";
  return "Use destination-labeled Disney transportation. Resort-to-resort trips may require a park or Disney Springs transfer.";
}

export default function TransportationPlanner() {
  const [days, setDays] = useState<TripDay[]>(FALLBACK_DAYS);
  const [selectedDate, setSelectedDate] = useState("2027-10-10");
  const [alternate, setAlternate] = useState(false);
  const [targetTime, setTargetTime] = useState("08:00");
  const [nextBus, setNextBus] = useState("");
  const [lookupFrom, setLookupFrom] = useState("value");
  const [lookupTo, setLookupTo] = useState("mk");

  useEffect(() => {
    ensureStyle();
    if (!API_BASE_URL) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TRIP_REQUEST_TIMEOUT_MS);
    fetch(`${API_BASE_URL}/api/trip-week`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data: TripWeekPlan) => {
        const relevant = (data.days || []).filter((day) => ["park", "rest", "flex"].includes(day.type));
        if (relevant.length) setDays(relevant);
      })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timeout));

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  const selectedDay = days.find((day) => day.date === selectedDate) || days[0];
  const alternateEligible = selectedDate === "2027-10-10" || selectedDate === "2027-10-13";
  const route = useMemo(
    () => makeRoute(selectedDay?.date || selectedDate, selectedDay?.park || selectedDay?.title || "", alternateEligible && alternate),
    [selectedDay, selectedDate, alternateEligible, alternate],
  );

  useEffect(() => {
    setTargetTime(route.defaultTarget);
    setNextBus("");
  }, [route.key]);

  const totalPlanningMinutes = route.walkToStop + route.travelMax + route.arrivalBuffer;
  const leaveBy = timeFromMinutes(minutesFromTime(targetTime) - totalPlanningMinutes);

  const busProjection = useMemo(() => {
    if (!nextBus) return null;
    const departure = minutesFromTime(nextBus);
    const earliest = departure + route.travelMin + route.arrivalBuffer;
    const latest = departure + route.travelMax + route.arrivalBuffer;
    const target = minutesFromTime(targetTime);
    return {
      range: `${timeFromMinutes(earliest)}–${timeFromMinutes(latest)}`,
      onTime: latest <= target,
    };
  }, [nextBus, route, targetTime]);

  return (
    <section className="card getting-there-card">
      <div className="getting-there-header">
        <div>
          <h2>Getting There</h2>
          <p className="muted">Trip-day route, exact leave-by time, boarding label, transfer points and backup plan.</p>
        </div>
        <span className="getting-there-pill">Trip-aware</span>
      </div>

      <div className="getting-there-days" aria-label="Choose a trip day">
        {days.map((day) => (
          <button
            type="button"
            key={day.date}
            className={`getting-there-day ${day.date === selectedDate ? "getting-there-day-active" : ""}`}
            onClick={() => setSelectedDate(day.date)}
          >
            <strong>{formatDay(day.date)}</strong><br />
            <span>{day.park || day.title}</span>
          </button>
        ))}
      </div>

      {alternateEligible && (
        <div className="getting-there-mode">
          <button type="button" className={!alternate ? "active" : ""} onClick={() => setAlternate(false)}>Base plan</button>
          <button type="button" className={alternate ? "active" : ""} onClick={() => setAlternate(true)}>MNSSHP alternate</button>
        </div>
      )}

      <div className="getting-there-route">
        <p className="muted">{route.from} → {route.to}</p>
        <h3>{route.title}</h3>
        {route.note && <p>{route.note}</p>}

        <div className="getting-there-summary">
          <label className="getting-there-metric">
            <span>{route.targetLabel}</span>
            <input className="getting-there-time-input" type="time" value={targetTime} onChange={(event) => setTargetTime(event.target.value)} />
          </label>
          <div className="getting-there-metric">
            <span>Leave your room by</span>
            <strong>{leaveBy}</strong>
          </div>
          <div className="getting-there-metric">
            <span>Primary route</span>
            <strong>{route.primary}</strong>
          </div>
          <div className="getting-there-metric">
            <span>Door-to-arrival allowance</span>
            <strong>{totalPlanningMinutes} min</strong>
          </div>
        </div>

        <ol className="getting-there-steps">
          {route.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>

        <div className="getting-there-info">
          <div className="getting-there-info-row"><span>Boarding destination</span><strong>{route.boardingLabel}</strong></div>
          <div className="getting-there-info-row"><span>Bus route number</span><strong>{route.routeNumber}</strong></div>
          <div className="getting-there-info-row"><span>Departure timetable</span><strong>{route.publishedSchedule}</strong></div>
        </div>

        <div className="getting-there-backup"><strong>Backup:</strong> {route.backup}</div>
      </div>

      {route.busAssist && (
        <div className="getting-there-bus-assist">
          <h3>Next bus timing check</h3>
          <p className="muted">Enter the departure shown on the resort screen or in My Disney Experience.</p>
          <label>
            <span className="stat-label">Next {route.boardingLabel} departure</span>
            <input className="getting-there-time-input" type="time" value={nextBus} onChange={(event) => setNextBus(event.target.value)} />
          </label>
          {busProjection && (
            <p className={busProjection.onTime ? "getting-there-status-good" : "getting-there-status-risk"} style={{ marginBottom: 0, marginTop: 10 }}>
              <strong>{busProjection.onTime ? "On schedule" : "Late-risk"}:</strong> estimated arrival {busProjection.range}.
            </p>
          )}
        </div>
      )}

      <details className="getting-there-lookup">
        <summary>Unexpected trip lookup</summary>
        <div className="getting-there-lookup-grid">
          <label><span className="stat-label">From</span><select value={lookupFrom} onChange={(event) => setLookupFrom(event.target.value)}>{LOOKUP_LOCATIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span className="stat-label">To</span><select value={lookupTo} onChange={(event) => setLookupTo(event.target.value)}>{LOOKUP_LOCATIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <p style={{ marginBottom: 0 }}>{quickLookup(lookupFrom, lookupTo)}</p>
      </details>
    </section>
  );
}
