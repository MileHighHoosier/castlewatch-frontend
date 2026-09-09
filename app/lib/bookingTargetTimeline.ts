import {
  BookingTarget,
  BookingTargetPriority,
  BookingWindowResult,
  calculateBookingWindow,
} from "./bookingTargets";
import { calendarDay } from "./tripDate";

export type BookingReadinessTone = "neutral" | "warning" | "upcoming" | "ready" | "late";

export type BookingReadiness = {
  id: "invalid" | "needs_verification" | "not_scheduled" | "upcoming" | "opens_today" | "open" | "deadline_today" | "past_deadline";
  label: string;
  detail: string;
  tone: BookingReadinessTone;
};

export type BookingTimelineEntry = {
  target: BookingTarget;
  window: BookingWindowResult;
  readiness: BookingReadiness;
};

const PRIORITY_ORDER: Record<BookingTargetPriority, number> = {
  must_do: 0,
  high: 1,
  standard: 2,
  low: 3,
};

function dayDistance(fromDate: string, toDate: string): number | null {
  const from = calendarDay(fromDate);
  const to = calendarDay(toDate);
  return from === null || to === null ? null : Math.round((to - from) / 86_400_000);
}

export function bookingWindowReadiness(window: BookingWindowResult, todayDate: string): BookingReadiness {
  if (calendarDay(todayDate) === null) {
    return {
      id: "invalid",
      label: "Review dates",
      detail: "CastleWatch could not determine today's planning date.",
      tone: "warning",
    };
  }

  const missingPlanningDate = window.targetId !== null
    && window.desiredTripDate === null
    && window.opening.date === null
    && window.opening.source === "none";
  if (missingPlanningDate) {
    return {
      id: "not_scheduled",
      label: "Date needed",
      detail: "Add a verified rule and desired trip date, or a clearly labeled manual opening date.",
      tone: "neutral",
    };
  }

  const optionalDeadlineAbsent = window.opening.source === "manual_override"
    && window.opening.status === "ready"
    && window.desiredTripDate === null
    && window.ruleVerification === "unavailable"
    && window.deadline.date === null
    && window.deadline.source === "none";
  if (window.opening.status === "invalid" || (window.deadline.status === "invalid" && !optionalDeadlineAbsent)) {
    return {
      id: "invalid",
      label: "Review dates",
      detail: "The current booking rule or date input is inconsistent.",
      tone: "warning",
    };
  }

  const usesCalculatedDate = window.opening.source === "calculated" || window.deadline.source === "calculated";
  if (
    usesCalculatedDate
    && window.ruleVerification === "verified"
    && (!window.ruleProvenance?.source.trim() || !window.ruleProvenance.asOfDate)
  ) {
    return {
      id: "needs_verification",
      label: "Verify source",
      detail: "A calculated date is missing its source or as-of date. Add both before relying on it.",
      tone: "warning",
    };
  }

  if (window.opening.status === "needs_verification" || window.deadline.status === "needs_verification") {
    return {
      id: "needs_verification",
      label: "Verify rule",
      detail: "A calculated date uses an assumption that has not been verified against an official source.",
      tone: "warning",
    };
  }

  if (!window.opening.date) {
    return {
      id: "not_scheduled",
      label: "Date needed",
      detail: "Add a verified rule or a clearly labeled manual opening date.",
      tone: "neutral",
    };
  }

  const openingDistance = dayDistance(todayDate, window.opening.date);
  const deadlineDistance = window.deadline.date ? dayDistance(todayDate, window.deadline.date) : null;
  if (openingDistance === null || (window.deadline.date && deadlineDistance === null)) {
    return {
      id: "invalid",
      label: "Review dates",
      detail: "The booking timeline contains a date that cannot be compared safely.",
      tone: "warning",
    };
  }

  if (window.deadline.date && window.opening.date > window.deadline.date) {
    return {
      id: "invalid",
      label: "Review dates",
      detail: "The opening date is after the deadline. Verify the rule or family overrides.",
      tone: "warning",
    };
  }

  if (openingDistance > 0) {
    return {
      id: "upcoming",
      label: `Opens in ${openingDistance} day${openingDistance === 1 ? "" : "s"}`,
      detail: `Opening date: ${window.opening.date}.`,
      tone: "upcoming",
    };
  }

  if (openingDistance === 0) {
    return {
      id: "opens_today",
      label: "Opens today",
      detail: `Opening date: ${window.opening.date}.`,
      tone: "ready",
    };
  }

  if (deadlineDistance === 0) {
    return {
      id: "deadline_today",
      label: "Deadline today",
      detail: `The current deadline is ${window.deadline.date}.`,
      tone: "warning",
    };
  }

  if (deadlineDistance !== null && deadlineDistance < 0) {
    return {
      id: "past_deadline",
      label: "Deadline passed",
      detail: `The current deadline was ${window.deadline.date}. Review this target manually.`,
      tone: "late",
    };
  }

  return {
    id: "open",
    label: "Window open",
    detail: deadlineDistance === null
      ? "The opening date has passed; no deadline is currently available."
      : `${deadlineDistance} day${deadlineDistance === 1 ? "" : "s"} until the current deadline.`,
    tone: "ready",
  };
}

export function buildBookingTimeline(targets: BookingTarget[], todayDate: string): BookingTimelineEntry[] {
  return targets
    .map((target) => {
      const window = calculateBookingWindow(target);
      return { target, window, readiness: bookingWindowReadiness(window, todayDate) };
    })
    .sort((left, right) => {
      const priority = PRIORITY_ORDER[left.target.priority] - PRIORITY_ORDER[right.target.priority];
      if (priority !== 0) return priority;
      const leftDate = left.window.opening.date || left.target.desiredTripDate || "9999-12-31";
      const rightDate = right.window.opening.date || right.target.desiredTripDate || "9999-12-31";
      return leftDate.localeCompare(rightDate) || left.target.title.localeCompare(right.target.title);
    });
}
