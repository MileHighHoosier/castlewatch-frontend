import { RESORT_OPTIONS } from "./tripResorts";

export type TransportationTiming = {
  travelMin: number;
  travelMax: number;
  walkToStop: number;
  arrivalBuffer: number;
};

export type ResortTransportationRoute = TransportationTiming & {
  assignable: boolean;
  originResortId?: string;
  origin: string;
  destination: string;
  mode: string;
  explanation: string;
};

export type ResortTransferRoute = TransportationTiming & {
  assignable: boolean;
  originResortId?: string;
  destinationResortId?: string;
  origin: string;
  destination: string;
  mode: string;
  explanation: string;
};

export type TransportationArrivalProjection = {
  range: string;
  onTime: boolean;
};

const PARKS = ["Magic Kingdom", "Epcot", "Hollywood Studios", "Animal Kingdom"];

function unassignableRoute(destination: string): ResortTransportationRoute {
  return {
    assignable: false,
    origin: "Unassigned resort",
    destination,
    mode: "Assign an overnight resort before calculating this route",
    travelMin: 0,
    travelMax: 0,
    walkToStop: 0,
    arrivalBuffer: 0,
    explanation: `The origin resort for ${destination} is not assignable yet.`,
  };
}

export function getResortTransportationRoute(
  resortId: string | undefined,
  destination: string,
): ResortTransportationRoute {
  if (destination === "MCO Arrival") {
    return {
      assignable: true,
      origin: "MCO",
      destination,
      mode: "Arrival transport to the selected resort",
      travelMin: 0,
      travelMax: 0,
      walkToStop: 0,
      arrivalBuffer: 0,
      explanation: "Arrival transportation begins at MCO and does not use an overnight resort.",
    };
  }

  const resort = RESORT_OPTIONS.find((option) => option.id === resortId);
  if (!resort) return unassignableRoute(destination);

  const route = (
    mode: string,
    travelMin: number,
    travelMax: number,
    walkToStop: number,
    arrivalBuffer: number,
  ): ResortTransportationRoute => ({
    assignable: true,
    originResortId: resort.id,
    origin: resort.shortName,
    destination,
    mode,
    travelMin,
    travelMax,
    walkToStop,
    arrivalBuffer,
    explanation: `${resort.shortName} to ${destination}: ${mode}; allow ${walkToStop + travelMax + arrivalBuffer} minutes door to arrival.`,
  });

  if (destination === "MCO Departure") {
    return route("Rideshare, rental car or airport transfer", 50, 75, 0, 0);
  }
  if (destination === "Epcot" && resort.category === "epcot-resort") {
    return route("Walk to Epcot International Gateway", 10, 20, 5, 15);
  }
  if (destination === "Epcot" && resort.category === "skyliner") {
    return route("Disney Skyliner to Epcot", 20, 40, 10, 15);
  }
  if (destination === "Hollywood Studios" && resort.category === "skyliner") {
    return route("Disney Skyliner to Hollywood Studios", 15, 35, 10, 15);
  }
  if (destination === "Hollywood Studios" && resort.category === "epcot-resort") {
    return route("Walk or Friendship Boat to Hollywood Studios", 20, 40, 5, 15);
  }
  if (destination === "Magic Kingdom" && resort.category === "monorail-resort") {
    return route(
      resort.id === "contemporary" ? "Walk to Magic Kingdom" : "Resort Monorail or boat",
      10,
      30,
      5,
      15,
    );
  }
  if (destination === "Grand Floridian" && resort.id === "grand") {
    return route("Walk inside Grand Floridian", 5, 10, 0, 10);
  }
  if (destination === "Grand Floridian" && resort.category === "monorail-resort") {
    return route("Resort Monorail or boat to Grand Floridian", 15, 35, 5, 10);
  }
  if (destination === "Grand Floridian") {
    return route("Bus to Magic Kingdom, then Resort Monorail or boat", 50, 75, 10, 10);
  }
  if (destination === "Beach Club" && resort.category === "epcot-resort") {
    return route("Walk within the Epcot resort area", 10, 20, 5, 0);
  }
  if (destination === "Animal Kingdom Lodge" && resort.category === "akl") {
    return route("Walk or internal resort transportation", 5, 20, 0, 0);
  }
  if (PARKS.includes(destination)) {
    const fasterAnimalKingdom = resort.category === "akl" && destination === "Animal Kingdom";
    return route(
      `Disney bus labeled ${destination}`,
      fasterAnimalKingdom ? 10 : 20,
      fasterAnimalKingdom ? 25 : 45,
      10,
      15,
    );
  }

  return route("Disney transportation or rideshare", 20, 45, 10, 0);
}

export function getResortTransferRoute(
  originResortId: string | undefined,
  destinationResortId: string | undefined,
): ResortTransferRoute {
  const origin = RESORT_OPTIONS.find((option) => option.id === originResortId);
  const destination = RESORT_OPTIONS.find((option) => option.id === destinationResortId);
  if (!origin || !destination) {
    return {
      assignable: false,
      originResortId: origin?.id,
      destinationResortId: destination?.id,
      origin: origin?.shortName || "Unassigned resort",
      destination: destination?.shortName || "Unassigned resort",
      mode: "Assign both resorts before calculating this transfer",
      travelMin: 0,
      travelMax: 0,
      walkToStop: 0,
      arrivalBuffer: 0,
      explanation: "The resort transfer is not assignable until both the origin and destination are known.",
    };
  }

  const sameResort = origin.id === destination.id;
  const destinationIsAkl = destination.category === "akl";
  const mode = sameResort
    ? "No resort transfer needed"
    : destinationIsAkl
      ? "Bus to Animal Kingdom, then bus to the selected AKL building"
      : `Bus to ${destination.category === "epcot-resort" || destination.category === "skyliner" ? "Hollywood Studios" : "Magic Kingdom"}, then continue to ${destination.shortName}`;
  const travelMin = sameResort ? 0 : 45;
  const travelMax = sameResort ? 0 : destinationIsAkl ? 75 : 80;
  const walkToStop = sameResort ? 0 : 10;
  return {
    assignable: true,
    originResortId: origin.id,
    destinationResortId: destination.id,
    origin: origin.shortName,
    destination: destination.shortName,
    mode,
    travelMin,
    travelMax,
    walkToStop,
    arrivalBuffer: 0,
    explanation: `${origin.shortName} to ${destination.shortName}: ${mode}; allow ${walkToStop + travelMax} minutes.`,
  };
}

export function transportationRouteRisk(route: ResortTransportationRoute) {
  if (!route.assignable) return 0;
  const planningMinutes = route.walkToStop + route.travelMax;
  if (planningMinutes <= 25) return 0;
  if (planningMinutes <= 45) return 1;
  if (planningMinutes <= 55) return 2;
  return 3;
}

function clockMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function displayTimeFromMinutes(total: number) {
  const normalized = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function transportationLeaveBy(
  targetTime: string,
  timing: Pick<TransportationTiming, "travelMax" | "walkToStop" | "arrivalBuffer">,
) {
  const target = clockMinutes(targetTime);
  if (target === null) return "Time needed";

  return displayTimeFromMinutes(
    target - timing.walkToStop - timing.travelMax - timing.arrivalBuffer,
  );
}

export function projectTransportationArrival(
  nextDeparture: string,
  targetTime: string,
  timing: Pick<TransportationTiming, "travelMin" | "travelMax" | "arrivalBuffer">,
): TransportationArrivalProjection | null {
  const departure = clockMinutes(nextDeparture);
  const target = clockMinutes(targetTime);
  if (departure === null || target === null) return null;

  const earliest = departure + timing.travelMin + timing.arrivalBuffer;
  const latest = departure + timing.travelMax + timing.arrivalBuffer;
  return {
    range: `${displayTimeFromMinutes(earliest)}–${displayTimeFromMinutes(latest)}`,
    onTime: latest <= target,
  };
}
