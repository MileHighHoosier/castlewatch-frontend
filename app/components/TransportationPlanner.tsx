"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "../lib/api";
import {
  DEFAULT_RESORT_PLAN,
  RESORT_OPTIONS,
  ResortOption,
  ResortPlan,
  getResortOption,
  loadResortPlan,
  previousDate,
  saveResortPlan,
} from "../lib/tripResorts";
import {
  getResortTransferRoute,
  getResortTransportationRoute,
  projectTransportationArrival,
  transportationLeaveBy,
} from "../lib/transportationPlanning";

const STYLE_ID = "castlewatch-getting-there-style";
const TRIP_REQUEST_TIMEOUT_MS = 12_000;

type TripDay = { date: string; type: string; park?: string; title: string };
type TripWeekPlan = { days?: TripDay[] };
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

type LookupLocation = { id: string; name: string };

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
    .getting-there-card { grid-column:1 / -1; }
    .getting-there-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
    .getting-there-header h2, .getting-there-header p { margin-top:0; }
    .getting-there-pill { border:1px solid rgba(99,164,255,.42); border-radius:999px; padding:5px 9px; font-size:11px; font-weight:900; white-space:nowrap; }
    .getting-there-days { display:flex; gap:8px; overflow-x:auto; padding:4px 0 10px; scrollbar-width:none; }
    .getting-there-days::-webkit-scrollbar { display:none; }
    .getting-there-day { flex:0 0 auto; border:1px solid rgba(255,255,255,.13); border-radius:12px; padding:8px 10px; background:rgba(255,255,255,.025); color:inherit; text-align:left; }
    .getting-there-day-active { border-color:rgba(99,164,255,.65); background:rgba(99,164,255,.11); }
    .getting-there-resorts { border:1px solid rgba(99,164,255,.27); background:rgba(99,164,255,.05); border-radius:14px; padding:11px; margin:0 0 12px; display:grid; gap:9px; }
    .getting-there-resorts label span { display:block; color:var(--muted); font-size:11px; font-weight:900; margin-bottom:4px; }
    .getting-there-resorts select { width:100%; border:1px solid rgba(255,255,255,.16); border-radius:10px; padding:9px; background:rgba(0,0,0,.16); color:inherit; font:inherit; }
    .getting-there-resort-note { color:var(--muted); font-size:11px; margin:0; }
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
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString([], { weekday:"short", month:"short", day:"numeric" });
}

function busToPark(date: string, title: string, resort: ResortOption, park: string, note?: string): RoutePlan {
  const short = resort.shortName;
  const destination = park;
  const boarding = park;
  const timing = getResortTransportationRoute(resort.id, park);
  return {
    key: `${date}-${resort.id}-${park}`,
    date,
    title,
    from: short,
    to: destination,
    targetLabel: "Desired gate arrival",
    defaultTarget: "08:00",
    primary: `Disney bus labeled ${destination}`,
    boardingLabel: boarding,
    routeNumber: `No public route number — board the bus marked ${destination}`,
    publishedSchedule: "No fixed public timetable — use the resort display or My Disney Experience",
    travelMin: timing.travelMin,
    travelMax: timing.travelMax,
    walkToStop: timing.walkToStop,
    arrivalBuffer: timing.arrivalBuffer,
    steps: [
      `Walk from ${short} to its Disney bus stop.`,
      `Join the queue marked ${destination}.`,
      `Exit at the ${destination} bus plaza and continue through security.`,
    ],
    backup: `If no ${destination} bus is posted by the leave-by time, use Minnie Van or rideshare.`,
    note,
    busAssist: true,
  };
}

function parkRoute(date: string, title: string, resort: ResortOption, park: string, note?: string): RoutePlan {
  const timing = getResortTransportationRoute(resort.id, park);
  if (park === "Epcot" && resort.category === "skyliner") {
    return {
      key:`${date}-${resort.id}-epcot-skyliner`, date, title, from:resort.shortName, to:"Epcot International Gateway",
      targetLabel:"Desired gate arrival", defaultTarget:"08:00", primary:"Disney Skyliner to Epcot",
      boardingLabel:"Epcot Skyliner direction", routeNumber:"No route number — follow signs for the Epcot line",
      publishedSchedule:"Continuous service when operating; weather can pause the Skyliner",
      travelMin:timing.travelMin, travelMax:timing.travelMax, walkToStop:timing.walkToStop, arrivalBuffer:timing.arrivalBuffer,
      steps:[`Walk from ${resort.shortName} to the Skyliner station.`, "Ride toward Caribbean Beach and transfer if directed.", "Exit at Epcot International Gateway and continue through security."],
      backup:"Use the destination-labeled Epcot bus or rideshare if Skyliner service is unavailable.", note, busAssist:false,
    };
  }

  if (park === "Hollywood Studios" && resort.category === "skyliner") {
    return {
      key:`${date}-${resort.id}-hs-skyliner`, date, title, from:resort.shortName, to:"Hollywood Studios",
      targetLabel:"Desired gate arrival", defaultTarget:"08:00", primary:"Disney Skyliner to Hollywood Studios",
      boardingLabel:"Hollywood Studios Skyliner direction", routeNumber:"No route number — follow signs for Hollywood Studios",
      publishedSchedule:"Continuous service when operating; weather can pause the Skyliner",
      travelMin:timing.travelMin, travelMax:timing.travelMax, walkToStop:timing.walkToStop, arrivalBuffer:timing.arrivalBuffer,
      steps:[`Walk from ${resort.shortName} to the Skyliner station.`, "Transfer at Caribbean Beach if directed.", "Exit at Hollywood Studios and continue to security."],
      backup:"Use the destination-labeled Hollywood Studios bus or rideshare if Skyliner service is unavailable.", note, busAssist:false,
    };
  }

  if (park === "Epcot" && resort.category === "epcot-resort") {
    return {
      key:`${date}-${resort.id}-epcot-walk`, date, title, from:resort.shortName, to:"Epcot International Gateway",
      targetLabel:"Desired gate arrival", defaultTarget:"08:00", primary:"Walk to International Gateway",
      boardingLabel:"No vehicle needed", routeNumber:"No route number — use the signed walking path",
      publishedSchedule:"Walking path is always available; Friendship Boat is the slower alternative",
      travelMin:timing.travelMin, travelMax:timing.travelMax, walkToStop:timing.walkToStop, arrivalBuffer:timing.arrivalBuffer,
      steps:[`Leave ${resort.shortName} toward Crescent Lake.`, "Follow signs to Epcot International Gateway.", "Enter through International Gateway rather than the front entrance."],
      backup:"Use the Friendship Boat when operating if walking is undesirable.", note, busAssist:false,
    };
  }

  if (park === "Hollywood Studios" && resort.category === "epcot-resort") {
    return {
      key:`${date}-${resort.id}-hs-boat`, date, title, from:resort.shortName, to:"Hollywood Studios",
      targetLabel:"Desired gate arrival", defaultTarget:"08:00", primary:"Walk or Friendship Boat",
      boardingLabel:"Hollywood Studios boat direction", routeNumber:"No route number — board the Friendship Boat marked Hollywood Studios",
      publishedSchedule:"Boats run continuously when operating; walking is usually more predictable",
      travelMin:timing.travelMin, travelMax:timing.travelMax, walkToStop:timing.walkToStop, arrivalBuffer:timing.arrivalBuffer,
      steps:[`Leave ${resort.shortName} toward Crescent Lake.`, "Walk the signed path to Hollywood Studios or board the Friendship Boat.", "Continue through security at Hollywood Studios."],
      backup:"Use rideshare when time is tight or boat service is delayed.", note, busAssist:false,
    };
  }

  if (park === "Magic Kingdom" && resort.category === "monorail-resort") {
    const contemporary = resort.id === "contemporary";
    return {
      key:`${date}-${resort.id}-mk-resort`, date, title, from:resort.shortName, to:"Magic Kingdom",
      targetLabel:"Desired gate arrival", defaultTarget:"08:00",
      primary: contemporary ? "Walk to Magic Kingdom" : "Resort Monorail or boat",
      boardingLabel: contemporary ? "No vehicle needed" : "Magic Kingdom direction",
      routeNumber:"No route number — use the walking path, Resort Monorail or resort boat",
      publishedSchedule:"Continuous resort transportation when operating",
      travelMin:timing.travelMin, travelMax:timing.travelMax, walkToStop:timing.walkToStop, arrivalBuffer:timing.arrivalBuffer,
      steps: contemporary
        ? ["Follow the signed walking path from Contemporary to Magic Kingdom.", "Continue through security and the tapstiles."]
        : [`Walk from ${resort.shortName} to the monorail platform or boat dock.`, "Use the Magic Kingdom direction.", "Continue through security and the tapstiles."],
      backup:"Use the alternate resort transportation mode or walk when a signed path is available.", note, busAssist:false,
    };
  }

  return busToPark(date, title, resort, park, note);
}

function diningRoute(date: string, resort: ResortOption): RoutePlan {
  const timing = getResortTransportationRoute(resort.id, "Grand Floridian");
  if (resort.id === "grand") {
    return {
      key:`${date}-${resort.id}-1900`, date, title:"Tuesday: 1900 Park Fare", from:resort.shortName, to:"1900 Park Fare",
      targetLabel:"Desired restaurant arrival", defaultTarget:"17:30", primary:"Walk inside Grand Floridian",
      boardingLabel:"No vehicle needed", routeNumber:"No route number", publishedSchedule:"No transportation required",
      travelMin:timing.travelMin, travelMax:timing.travelMax, walkToStop:timing.walkToStop, arrivalBuffer:timing.arrivalBuffer,
      steps:["Walk through Grand Floridian to 1900 Park Fare."], backup:"Ask a Cast Member for directions inside the resort.", busAssist:false,
    };
  }

  if (resort.category === "monorail-resort") {
    return {
      key:`${date}-${resort.id}-1900-monorail`, date, title:"Tuesday: 1900 Park Fare", from:resort.shortName, to:"Grand Floridian",
      targetLabel:"Desired restaurant arrival", defaultTarget:"17:30", primary:"Resort Monorail or resort boat",
      boardingLabel:"Grand Floridian direction", routeNumber:"No route number — use Resort Monorail or resort boat",
      publishedSchedule:"Continuous resort transportation when operating",
      travelMin:timing.travelMin, travelMax:timing.travelMax, walkToStop:timing.walkToStop, arrivalBuffer:timing.arrivalBuffer,
      steps:[`Walk from ${resort.shortName} to its monorail platform or boat dock.`, "Travel to Grand Floridian.", "Walk to 1900 Park Fare."],
      backup:"Use Minnie Van or rideshare for a hard dining deadline.", busAssist:false,
    };
  }

  return {
    key:`${date}-${resort.id}-1900`, date, title:"Tuesday: 1900 Park Fare", from:resort.shortName, to:"Grand Floridian",
    targetLabel:"Desired restaurant arrival", defaultTarget:"17:30", primary:"Bus to Magic Kingdom, then Resort Monorail or boat",
    boardingLabel:"Magic Kingdom", routeNumber:"No public route number — first board the bus marked Magic Kingdom",
    publishedSchedule:"No fixed public timetable — allow extra transfer time",
    travelMin:timing.travelMin, travelMax:timing.travelMax, walkToStop:timing.walkToStop, arrivalBuffer:timing.arrivalBuffer,
    steps:[`Walk from ${resort.shortName} to its bus stop.`, "Board the bus labeled Magic Kingdom.", "At Magic Kingdom, follow signs to the Resort Monorail or Grand Floridian boat dock.", "Exit at Grand Floridian and walk to 1900 Park Fare."],
    backup:"Minnie Van or rideshare is the safer backup for a hard reservation time.", busAssist:true,
  };
}

function transferRoute(date: string, origin: ResortOption, destination: ResortOption): RoutePlan {
  const timing = getResortTransferRoute(origin.id, destination.id);
  if (origin.id === destination.id) {
    return {
      key:`${date}-${origin.id}-same`, date, title:`Friday: stay at ${destination.shortName}`, from:origin.shortName, to:destination.shortName,
      targetLabel:"Desired resort arrival", defaultTarget:"15:00", primary:"No resort transfer needed",
      boardingLabel:"No vehicle needed", routeNumber:"No route number", publishedSchedule:"No transportation required",
      travelMin:timing.travelMin, travelMax:timing.travelMax, walkToStop:timing.walkToStop, arrivalBuffer:timing.arrivalBuffer,
      steps:["Keep the same resort room plan unless the reservation changes."], backup:"None needed.", busAssist:false,
    };
  }

  if (destination.category === "akl") {
    return {
      key:`${date}-${origin.id}-${destination.id}`, date, title:`Friday: transfer to ${destination.shortName}`, from:origin.shortName, to:destination.shortName,
      targetLabel:"Desired new-resort arrival", defaultTarget:"15:00", primary:"Bus to Animal Kingdom, then bus to the selected AKL building",
      boardingLabel:"Animal Kingdom first", routeNumber:"No public route number — use destination-labeled buses",
      publishedSchedule:"No direct resort-to-resort timetable; this route requires a transfer",
      travelMin:timing.travelMin, travelMax:timing.travelMax, walkToStop:timing.walkToStop, arrivalBuffer:timing.arrivalBuffer,
      steps:[`Board the Animal Kingdom bus at ${origin.shortName}.`, "At Animal Kingdom, locate the resort-bus load zones.", `Board the bus labeled ${destination.name}.`, `Confirm ${destination.shortName} before boarding.`],
      backup:"Use Disney luggage transfer for bags and rideshare for the family; that is usually simpler than the free two-bus route.", busAssist:true,
    };
  }

  const hub = destination.category === "epcot-resort" || destination.category === "skyliner" ? "Hollywood Studios" : "Magic Kingdom";
  return {
    key:`${date}-${origin.id}-${destination.id}`, date, title:`Friday: transfer to ${destination.shortName}`, from:origin.shortName, to:destination.shortName,
    targetLabel:"Desired new-resort arrival", defaultTarget:"15:00", primary:`Bus to ${hub}, then continue to ${destination.shortName}`,
    boardingLabel:`${hub} first`, routeNumber:"No public route number — use destination-labeled transportation",
    publishedSchedule:"No direct resort-to-resort timetable; allow transfer time",
    travelMin:timing.travelMin, travelMax:timing.travelMax, walkToStop:timing.walkToStop, arrivalBuffer:timing.arrivalBuffer,
    steps:[`Board the ${hub} bus at ${origin.shortName}.`, `At ${hub}, follow signs for transportation to ${destination.shortName}.`, `Confirm the destination before boarding.`],
    backup:"Use Disney luggage transfer for bags and rideshare for the family when changing resorts.", busAssist:true,
  };
}

function resortDatesForRoute(date: string) {
  if (date === "2027-10-12") return { originNight: date, destinationNight: null as string | null };
  if (date === "2027-10-15") return { originNight: previousDate(date), destinationNight: date };
  return { originNight: previousDate(date), destinationNight: null as string | null };
}

function makeRoute(date: string, alternate: boolean, resortPlan: ResortPlan): RoutePlan {
  const dates = resortDatesForRoute(date);
  const origin = getResortOption(resortPlan[dates.originNight]);
  const destinationResort = dates.destinationNight ? getResortOption(resortPlan[dates.destinationNight]) : null;

  if (date === "2027-10-10") {
    return parkRoute(date, alternate ? "Sunday alternate: Epcot" : "Sunday: Magic Kingdom", origin, alternate ? "Epcot" : "Magic Kingdom", alternate ? undefined : "This park assignment remains provisional until 2027 MNSSHP dates are released.");
  }
  if (date === "2027-10-11") return parkRoute(date, "Monday: Hollywood Studios", origin, "Hollywood Studios");
  if (date === "2027-10-12") return diningRoute(date, origin);
  if (date === "2027-10-13") return parkRoute(date, alternate ? "Wednesday alternate: Magic Kingdom" : "Wednesday: Epcot", origin, alternate ? "Magic Kingdom" : "Epcot");
  if (date === "2027-10-14") return parkRoute(date, "Thursday: Animal Kingdom", origin, "Animal Kingdom");
  return transferRoute(date, origin, destinationResort || getResortOption("akl_jambo"));
}

function quickLookup(from: string, to: string) {
  if (from === to) return "You are already there.";
  if (from === "beach" && to === "epcot") return "Walk to Epcot International Gateway; allow about 15–25 minutes door to gate.";
  if (from === "beach" && to === "grand") return "Bus to Magic Kingdom, then Resort Monorail or boat to Grand Floridian; allow 60–90 minutes.";
  if (from === "value" && ["mk","epcot","hs","ak"].includes(to)) return `Board the destination-labeled Disney bus to ${LOOKUP_LOCATIONS.find((item) => item.id === to)?.name}; no public route number is used.`;
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
  const [resortPlan, setResortPlan] = useState<ResortPlan>({ ...DEFAULT_RESORT_PLAN });

  useEffect(() => {
    ensureStyle();
    setResortPlan(loadResortPlan());
    if (!API_BASE_URL) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TRIP_REQUEST_TIMEOUT_MS);
    fetch(`${API_BASE_URL}/api/trip-week`, { cache:"no-store", headers:{ Accept:"application/json" }, signal:controller.signal })
      .then((response) => response.json())
      .then((data: TripWeekPlan) => {
        const relevant = (data.days || []).filter((day) => ["park","rest","flex"].includes(day.type));
        if (relevant.length) setDays(relevant);
      })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timeout));

    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, []);

  const selectedDay = days.find((day) => day.date === selectedDate) || days[0];
  const alternateEligible = selectedDate === "2027-10-10" || selectedDate === "2027-10-13";
  const resortDates = resortDatesForRoute(selectedDate);
  const originResort = getResortOption(resortPlan[resortDates.originNight]);
  const destinationResort = resortDates.destinationNight ? getResortOption(resortPlan[resortDates.destinationNight]) : null;
  const route = useMemo(() => makeRoute(selectedDay?.date || selectedDate, alternateEligible && alternate, resortPlan), [selectedDay, selectedDate, alternateEligible, alternate, resortPlan]);

  useEffect(() => { setTargetTime(route.defaultTarget); setNextBus(""); }, [route.key]);

  function changeResort(date: string, resortId: string) {
    const next = { ...resortPlan, [date]: resortId };
    setResortPlan(next);
    saveResortPlan(next);
  }

  const totalPlanningMinutes = route.walkToStop + route.travelMax + route.arrivalBuffer;
  const leaveBy = transportationLeaveBy(targetTime, route);
  const busProjection = useMemo(() => {
    if (!nextBus) return null;
    return projectTransportationArrival(nextBus, targetTime, route);
  }, [nextBus, route, targetTime]);

  const originLabel = selectedDate === "2027-10-12"
    ? "Resort after Tuesday check-in"
    : `Overnight before ${formatDay(selectedDate)}`;

  return (
    <section className="card getting-there-card">
      <div className="getting-there-header">
        <div><h2>Getting There</h2><p className="muted">Trip-day route, exact leave-by time, boarding label, transfer points and backup plan.</p></div>
        <span className="getting-there-pill">Trip-aware</span>
      </div>

      <div className="getting-there-days" aria-label="Choose a trip day">
        {days.map((day) => (
          <button type="button" key={day.date} className={`getting-there-day ${day.date === selectedDate ? "getting-there-day-active" : ""}`} onClick={() => setSelectedDate(day.date)}>
            <strong>{formatDay(day.date)}</strong><br /><span>{day.park || day.title}</span>
          </button>
        ))}
      </div>

      <div className="getting-there-resorts">
        <label>
          <span>{originLabel}</span>
          <select value={originResort.id} onChange={(event) => changeResort(resortDates.originNight, event.target.value)}>
            {RESORT_OPTIONS.map((resort) => <option key={resort.id} value={resort.id}>{resort.name}</option>)}
          </select>
        </label>
        {resortDates.destinationNight && destinationResort && (
          <label>
            <span>Overnight after Friday</span>
            <select value={destinationResort.id} onChange={(event) => changeResort(resortDates.destinationNight!, event.target.value)}>
              {RESORT_OPTIONS.map((resort) => <option key={resort.id} value={resort.id}>{resort.name}</option>)}
            </select>
          </label>
        )}
        <p className="getting-there-resort-note">Saved automatically on this device. Change these after bookings are finalized.</p>
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
          <label className="getting-there-metric"><span>{route.targetLabel}</span><input className="getting-there-time-input" type="time" value={targetTime} onChange={(event) => setTargetTime(event.target.value)} /></label>
          <div className="getting-there-metric"><span>Leave your room by</span><strong>{leaveBy}</strong></div>
          <div className="getting-there-metric"><span>Primary route</span><strong>{route.primary}</strong></div>
          <div className="getting-there-metric"><span>Door-to-arrival allowance</span><strong>{totalPlanningMinutes} min</strong></div>
        </div>
        <ol className="getting-there-steps">{route.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        <div className="getting-there-info">
          <div className="getting-there-info-row"><span>Boarding destination</span><strong>{route.boardingLabel}</strong></div>
        </div>
        <div className="getting-there-backup"><strong>Backup:</strong> {route.backup}</div>
      </div>

      {route.busAssist && (
        <div className="getting-there-bus-assist">
          <h3>Next bus timing check</h3>
          <p className="muted">Enter the departure shown on the resort screen or in My Disney Experience.</p>
          <label><span className="stat-label">Next {route.boardingLabel} departure</span><input className="getting-there-time-input" type="time" value={nextBus} onChange={(event) => setNextBus(event.target.value)} /></label>
          {busProjection && <p className={busProjection.onTime ? "getting-there-status-good" : "getting-there-status-risk"} style={{ marginBottom:0, marginTop:10 }}><strong>{busProjection.onTime ? "On schedule" : "Late-risk"}:</strong> estimated arrival {busProjection.range}.</p>}
        </div>
      )}

      <details className="getting-there-lookup">
        <summary>Unexpected trip lookup</summary>
        <div className="getting-there-lookup-grid">
          <label><span className="stat-label">From</span><select value={lookupFrom} onChange={(event) => setLookupFrom(event.target.value)}>{LOOKUP_LOCATIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span className="stat-label">To</span><select value={lookupTo} onChange={(event) => setLookupTo(event.target.value)}>{LOOKUP_LOCATIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <p style={{ marginBottom:0 }}>{quickLookup(lookupFrom, lookupTo)}</p>
      </details>
    </section>
  );
}
