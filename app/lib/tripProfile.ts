import { ResortPlan, previousDate } from "./tripResorts";
import { getResortTransportationRoute } from "./transportationPlanning";

export type TripProfile = {
  tripName: string;
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  childAges: string;
  status: "provisional" | "confirmed";
  noParkHopping: boolean;
  notes: string;
};

export type ReservationStatus = "provisional" | "confirmed";
export type ReservationType = "dining" | "experience" | "tour" | "flight" | "other";

export type TripReservation = {
  id: string;
  type: ReservationType;
  title: string;
  date: string;
  time: string;
  location: string;
  status: ReservationStatus;
  durationMinutes: number;
  arrivalBufferMinutes: number;
  notes: string;
};

export type ReservationWarning = {
  reservationId?: string;
  date: string;
  level: "warning" | "conflict";
  message: string;
};

export type ReservationPlan = {
  requiredArrival?: string;
  leaveBy?: string;
  route: string;
  origin: string;
  travelMinutes: number;
};

export const PROFILE_STORAGE_KEY = "castlewatch.trip-profile.v1";
export const RESERVATION_STORAGE_KEY = "castlewatch.trip-reservations.v1";

export const DEFAULT_TRIP_PROFILE: TripProfile = {
  tripName: "Columbus Day Week 2027",
  startDate: "2027-10-09",
  endDate: "2027-10-16",
  adults: 2,
  children: 2,
  childAges: "",
  status: "provisional",
  noParkHopping: true,
  notes: "",
};

export const RESERVATION_TEMPLATES = [
  { title: "Bibbidi Bobbidi Boutique", type: "experience" as ReservationType, location: "Magic Kingdom", durationMinutes: 90, arrivalBufferMinutes: 30 },
  { title: "Cinderella's Royal Table", type: "dining" as ReservationType, location: "Magic Kingdom", durationMinutes: 90, arrivalBufferMinutes: 20 },
  { title: "1900 Park Fare", type: "dining" as ReservationType, location: "Grand Floridian", durationMinutes: 90, arrivalBufferMinutes: 20 },
  { title: "Lightsaber Building", type: "experience" as ReservationType, location: "Hollywood Studios", durationMinutes: 45, arrivalBufferMinutes: 20 },
  { title: "Private Tour", type: "tour" as ReservationType, location: "Other", durationMinutes: 420, arrivalBufferMinutes: 30 },
  { title: "Arrival Flight", type: "flight" as ReservationType, location: "MCO Arrival", durationMinutes: 60, arrivalBufferMinutes: 0 },
  { title: "Departure Flight", type: "flight" as ReservationType, location: "MCO Departure", durationMinutes: 60, arrivalBufferMinutes: 180 },
];

export const RESERVATION_LOCATIONS = [
  "Magic Kingdom",
  "Epcot",
  "Hollywood Studios",
  "Animal Kingdom",
  "Grand Floridian",
  "Beach Club",
  "Animal Kingdom Lodge",
  "MCO Arrival",
  "MCO Departure",
  "Other",
];

export function loadTripProfile(): TripProfile {
  if (typeof window === "undefined") return { ...DEFAULT_TRIP_PROFILE };
  try {
    const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_TRIP_PROFILE };
    return { ...DEFAULT_TRIP_PROFILE, ...JSON.parse(stored) };
  } catch {
    return { ...DEFAULT_TRIP_PROFILE };
  }
}

export function saveTripProfile(profile: TripProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function loadReservations(): TripReservation[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(RESERVATION_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveReservations(reservations: TripReservation[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RESERVATION_STORAGE_KEY, JSON.stringify(reservations));
}

export function newReservation(template?: (typeof RESERVATION_TEMPLATES)[number]): TripReservation {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    type: template?.type || "dining",
    title: template?.title || "New reservation",
    date: "2027-10-10",
    time: "12:00",
    location: template?.location || "Magic Kingdom",
    status: "provisional",
    durationMinutes: template?.durationMinutes || 90,
    arrivalBufferMinutes: template?.arrivalBufferMinutes || 20,
    notes: "",
  };
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function minutesToTime(total: number) {
  const normalized = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function originNightForReservation(reservation: TripReservation) {
  if (reservation.type === "flight" && reservation.location === "MCO Arrival") return null;
  return timeToMinutes(reservation.time) >= 15 * 60
    ? reservation.date
    : previousDate(reservation.date);
}

export function reservationPlan(reservation: TripReservation, resortPlan: ResortPlan): ReservationPlan {
  if (!reservation.time) {
    return { route: "Add a time to calculate leave-by guidance.", origin: "", travelMinutes: 0 };
  }

  const originNight = originNightForReservation(reservation);
  const timing = getResortTransportationRoute(
    originNight ? resortPlan[originNight] : undefined,
    reservation.location,
  );
  const route = {
    origin: timing.origin,
    route: timing.mode,
    travelMinutes: timing.walkToStop + timing.travelMax,
  };

  if (reservation.location === "MCO Arrival") {
    return { ...route };
  }

  const scheduled = timeToMinutes(reservation.time);
  const requiredArrival = scheduled - reservation.arrivalBufferMinutes;
  const leaveBy = requiredArrival - route.travelMinutes;

  return {
    ...route,
    requiredArrival: minutesToTime(requiredArrival),
    leaveBy: minutesToTime(leaveBy),
  };
}

function locationPark(location: string) {
  return ["Magic Kingdom", "Epcot", "Hollywood Studios", "Animal Kingdom"].includes(location)
    ? location
    : null;
}

function transferMinutes(from: string, to: string) {
  if (from === to) return 20;
  const fromPark = locationPark(from);
  const toPark = locationPark(to);
  if (fromPark && toPark && fromPark !== toPark) return 75;
  if (fromPark || toPark) return 60;
  return 45;
}

export function buildReservationWarnings(
  reservations: TripReservation[],
  assignedParks: Record<string, string>,
  noParkHopping: boolean,
): ReservationWarning[] {
  const warnings: ReservationWarning[] = [];
  const byDate = new Map<string, TripReservation[]>();

  for (const reservation of reservations) {
    if (!byDate.has(reservation.date)) byDate.set(reservation.date, []);
    byDate.get(reservation.date)!.push(reservation);

    const reservationPark = locationPark(reservation.location);
    const assignedPark = assignedParks[reservation.date];
    if (reservationPark && assignedPark && reservationPark !== assignedPark) {
      warnings.push({
        reservationId: reservation.id,
        date: reservation.date,
        level: noParkHopping ? "conflict" : "warning",
        message: `${reservation.title} is at ${reservationPark}, but Trip Week assigns ${assignedPark}.`,
      });
    }
  }

  for (const [date, dayReservations] of byDate) {
    const timed = dayReservations
      .filter((reservation) => reservation.time)
      .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

    const parks = Array.from(new Set(timed.map((reservation) => locationPark(reservation.location)).filter(Boolean)));
    if (noParkHopping && parks.length > 1) {
      warnings.push({
        date,
        level: "conflict",
        message: `Reservations span multiple parks on the same day: ${parks.join(" and ")}.`,
      });
    }

    for (let index = 1; index < timed.length; index += 1) {
      const previous = timed[index - 1];
      const current = timed[index];
      const previousEnd = timeToMinutes(previous.time) + previous.durationMinutes;
      const currentArrival = timeToMinutes(current.time) - current.arrivalBufferMinutes;
      const requiredTransfer = transferMinutes(previous.location, current.location);
      const available = currentArrival - previousEnd;

      if (available < 0) {
        warnings.push({
          reservationId: current.id,
          date,
          level: "conflict",
          message: `${previous.title} overlaps the arrival window for ${current.title}.`,
        });
      } else if (available < requiredTransfer) {
        warnings.push({
          reservationId: current.id,
          date,
          level: "warning",
          message: `Only ${available} minutes remain between ${previous.title} and ${current.title}; allow about ${requiredTransfer} minutes.`,
        });
      }
    }
  }

  return warnings;
}
