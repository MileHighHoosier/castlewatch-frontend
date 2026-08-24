export type ResortCategory =
  | "value-bus"
  | "skyliner"
  | "epcot-resort"
  | "monorail-resort"
  | "akl"
  | "generic";

export type ResortOption = {
  id: string;
  name: string;
  shortName: string;
  category: ResortCategory;
};

export type ResortPlan = Record<string, string>;

export const RESORT_STORAGE_KEY = "castlewatch.trip-resorts.v1";

export const RESORT_OPTIONS: ResortOption[] = [
  { id: "value_tbd", name: "Value Resort — not booked yet", shortName: "Value Resort", category: "value-bus" },
  { id: "pop", name: "Disney's Pop Century Resort", shortName: "Pop Century", category: "skyliner" },
  { id: "art", name: "Disney's Art of Animation Resort", shortName: "Art of Animation", category: "skyliner" },
  { id: "allstar_movies", name: "Disney's All-Star Movies Resort", shortName: "All-Star Movies", category: "value-bus" },
  { id: "allstar_music", name: "Disney's All-Star Music Resort", shortName: "All-Star Music", category: "value-bus" },
  { id: "allstar_sports", name: "Disney's All-Star Sports Resort", shortName: "All-Star Sports", category: "value-bus" },
  { id: "beach", name: "Disney's Beach Club Resort", shortName: "Beach Club", category: "epcot-resort" },
  { id: "boardwalk", name: "Disney's BoardWalk Inn", shortName: "BoardWalk", category: "epcot-resort" },
  { id: "contemporary", name: "Disney's Contemporary Resort", shortName: "Contemporary", category: "monorail-resort" },
  { id: "poly", name: "Disney's Polynesian Village Resort", shortName: "Polynesian", category: "monorail-resort" },
  { id: "grand", name: "Disney's Grand Floridian Resort & Spa", shortName: "Grand Floridian", category: "monorail-resort" },
  { id: "akl_jambo", name: "Disney's Animal Kingdom Lodge — Jambo House", shortName: "AKL Jambo House", category: "akl" },
  { id: "akl_kidani", name: "Disney's Animal Kingdom Villas — Kidani Village", shortName: "AKL Kidani Village", category: "akl" },
  { id: "other", name: "Other Disney Resort", shortName: "Other Disney Resort", category: "generic" },
];

export const DEFAULT_RESORT_PLAN: ResortPlan = {
  "2027-10-09": "value_tbd",
  "2027-10-10": "value_tbd",
  "2027-10-11": "value_tbd",
  "2027-10-12": "beach",
  "2027-10-13": "beach",
  "2027-10-14": "beach",
  "2027-10-15": "akl_jambo",
};

export function getResortOption(id?: string) {
  return RESORT_OPTIONS.find((resort) => resort.id === id) || RESORT_OPTIONS[0];
}

export function loadResortPlan(): ResortPlan {
  if (typeof window === "undefined") return { ...DEFAULT_RESORT_PLAN };

  try {
    const stored = window.localStorage.getItem(RESORT_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_RESORT_PLAN };
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_RESORT_PLAN };
    return { ...DEFAULT_RESORT_PLAN, ...parsed };
  } catch {
    return { ...DEFAULT_RESORT_PLAN };
  }
}

export function saveResortPlan(plan: ResortPlan) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RESORT_STORAGE_KEY, JSON.stringify(plan));
}

export function previousDate(dateValue: string) {
  const value = new Date(`${dateValue}T12:00:00`);
  value.setDate(value.getDate() - 1);
  return value.toISOString().slice(0, 10);
}
