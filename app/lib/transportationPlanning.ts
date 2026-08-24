export type TransportationTiming = {
  travelMin: number;
  travelMax: number;
  walkToStop: number;
  arrivalBuffer: number;
};

export type TransportationArrivalProjection = {
  range: string;
  onTime: boolean;
};

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
