export const LIGHTNING_LANE_CONFLICT_SOON_MINUTES = 60;
export const LIGHTNING_LANE_STORAGE_KEY = "castlewatch.lightningLanes.v1";
export const LIGHTNING_LANE_PARKS = [
  "Magic Kingdom",
  "Epcot",
  "Hollywood Studios",
  "Animal Kingdom",
] as const;

export type LightningLanePark = (typeof LIGHTNING_LANE_PARKS)[number];

export type LightningLane = {
  id: string;
  name: string;
  start: string;
  end: string;
  used: boolean;
  date?: string;
  park?: LightningLanePark;
};

function isTripDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isLightningLanePark(value: unknown): value is LightningLanePark {
  return LIGHTNING_LANE_PARKS.includes(value as LightningLanePark);
}

function clockMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isValidLightningLane(lane: unknown): lane is LightningLane {
  if (!lane || typeof lane !== "object") return false;
  const candidate = lane as Partial<LightningLane>;
  const start = typeof candidate.start === "string" ? clockMinutes(candidate.start) : null;
  const end = typeof candidate.end === "string" ? clockMinutes(candidate.end) : null;
  const hasDate = candidate.date !== undefined;
  const hasPark = candidate.park !== undefined;
  const assignmentIsValid = !hasDate && !hasPark
    || (isTripDate(candidate.date) && isLightningLanePark(candidate.park));

  return typeof candidate.id === "string"
    && candidate.id.length > 0
    && typeof candidate.name === "string"
    && candidate.name.trim().length > 0
    && start !== null
    && end !== null
    && end > start
    && typeof candidate.used === "boolean"
    && assignmentIsValid;
}

export function parseLightningLanes(raw: string | null): LightningLane[] {
  try {
    const parsed: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidLightningLane)
      .map((lane) => ({ ...lane, name: lane.name.trim() }));
  } catch {
    return [];
  }
}

function minutesFromNow(time: string, now: Date) {
  const minutes = clockMinutes(time);
  if (minutes === null) return Number.POSITIVE_INFINITY;

  const target = new Date(now);
  target.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

export function formatLightningLaneTime(time: string) {
  const minutes = clockMinutes(time);
  if (minutes === null) return time || "Time needed";

  const rawHours = Math.floor(minutes / 60);
  const rawMinutes = minutes % 60;
  const suffix = rawHours >= 12 ? "PM" : "AM";
  return `${rawHours % 12 || 12}:${String(rawMinutes).padStart(2, "0")} ${suffix}`;
}

export function formatLightningLaneWindow(start: string, end: string) {
  if (!start || !end) return "Window needed";
  return `${formatLightningLaneTime(start)}–${formatLightningLaneTime(end)}`;
}

export function lightningLaneStatus(lane: LightningLane, now = new Date()) {
  if (lane.used) return "Used";

  const untilStart = minutesFromNow(lane.start, now);
  const untilEnd = minutesFromNow(lane.end, now);
  if (untilEnd < 0) return "Expired";
  if (untilStart <= 0 && untilEnd >= 0) return "Use now";
  if (untilStart <= 30) return `Soon · ${untilStart}m`;
  return `Later · ${untilStart}m`;
}

function laneUrgencySortValue(lane: LightningLane, now: Date) {
  const untilStart = minutesFromNow(lane.start, now);
  const untilEnd = minutesFromNow(lane.end, now);

  if (lane.used) return 300000 + untilStart;
  if (untilEnd < 0) return 200000 + Math.abs(untilEnd);
  if (untilStart <= 0 && untilEnd >= 0) return -100000 + untilEnd;
  return untilStart;
}

export function sortLightningLanesByUrgency(lanes: LightningLane[], now = new Date()) {
  return [...lanes].sort(
    (a, b) => laneUrgencySortValue(a, now) - laneUrgencySortValue(b, now),
  );
}

export function activeLightningLaneConflict(lanes: LightningLane[], now = new Date()) {
  return lanes
    .filter((lane) => !lane.used && lightningLaneStatus(lane, now) !== "Expired")
    .map((lane) => ({
      lane,
      untilStart: minutesFromNow(lane.start, now),
      untilEnd: minutesFromNow(lane.end, now),
    }))
    .filter(({ untilStart, untilEnd }) => (
      untilEnd >= 0 && untilStart <= LIGHTNING_LANE_CONFLICT_SOON_MINUTES
    ))
    .sort((a, b) => a.untilStart - b.untilStart)[0] || null;
}

export function lightningLaneConflictNote(lanes: LightningLane[], now = new Date()) {
  const conflict = activeLightningLaneConflict(lanes, now);
  if (!conflict) return "";

  const { lane, untilStart } = conflict;
  if (untilStart <= 0) {
    return `Lightning Lane active: ${lane.name} ${formatLightningLaneWindow(lane.start, lane.end)}. Check this before following the Plan move.`;
  }
  return `Lightning Lane soon: ${lane.name} ${formatLightningLaneWindow(lane.start, lane.end)} starts in ${untilStart}m. Avoid crossing the park unless this Plan move still fits.`;
}

export function nextLightningLaneHint(lanes: LightningLane[], now = new Date()) {
  const active = lanes.filter(
    (lane) => !lane.used && lightningLaneStatus(lane, now) !== "Expired",
  );
  if (!active.length) return "No active Lightning Lane windows. Add one when booked.";

  const current = active.find((lane) => lightningLaneStatus(lane, now) === "Use now");
  if (current) return `After tapping into ${current.name}, check for another selection.`;

  const next = sortLightningLanesByUrgency(active, now)[0];
  return `Next window to watch: ${next.name} at ${formatLightningLaneTime(next.start)}.`;
}