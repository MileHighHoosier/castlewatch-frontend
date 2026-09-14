import {
  BookingAttempt,
  BookingAttemptResult,
  BookingFallbackChoice,
  BookingTarget,
  isBookingTarget,
} from "./bookingTargets";
import { calendarDay } from "./tripDate";

export type BookingLifecycleAction =
  | { type: "record_attempt"; attemptId: string; attemptedOn: string; note: string }
  | { type: "mark_unavailable"; attemptId: string; attemptedOn: string; note: string }
  | { type: "choose_backup"; selectedOn: string; title: string; note: string }
  | { type: "link_booked"; attemptId: string; attemptedOn: string; note: string; reservationId: string }
  | { type: "return_to_planned" }
  | { type: "unlink_booking" };

export type BookingLifecycleSummary = {
  linkedReservationTitle: string | null;
  warning: string | null;
};

type ReservationReference = { id: string; title: string };

function requiredText(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function requiredDate(value: string, label: string) {
  if (calendarDay(value) === null) throw new Error(`${label} must be a valid calendar date.`);
  return value;
}

function appendAttempt(
  target: BookingTarget,
  input: { id: string; attemptedOn: string; result: BookingAttemptResult; note: string; reservationId: string | null },
) {
  const attempt: BookingAttempt = {
    id: requiredText(input.id, "Attempt identifier"),
    attemptedOn: requiredDate(input.attemptedOn, "Attempt date"),
    result: input.result,
    note: input.note.trim(),
    reservationId: input.reservationId,
  };
  const attempts = target.attempts || [];
  if (attempts.some((row) => row.id === attempt.id)) throw new Error("That attempt has already been recorded.");
  return [...attempts, attempt];
}

export function applyBookingLifecycleAction(
  value: BookingTarget,
  action: BookingLifecycleAction,
  reservations: readonly ReservationReference[] = [],
): BookingTarget {
  if (!isBookingTarget(value)) throw new Error("The booking target is malformed. Nothing was changed.");

  if (action.type === "unlink_booking") {
    if (!value.linkedReservationId) throw new Error("This target is not linked to a reservation.");
    return { ...value, status: "attempted", linkedReservationId: null };
  }

  if (value.linkedReservationId) {
    throw new Error("Unlink the booked reservation before changing this target's lifecycle.");
  }

  if (action.type === "return_to_planned") return { ...value, status: "planned" };

  if (action.type === "choose_backup") {
    const fallbackChoice: BookingFallbackChoice = {
      title: requiredText(action.title, "Backup choice"),
      selectedOn: requiredDate(action.selectedOn, "Backup selection date"),
      note: action.note.trim(),
    };
    return { ...value, status: "backup", fallbackChoice };
  }

  if (action.type === "link_booked") {
    const reservationId = requiredText(action.reservationId, "Reservation selection");
    if (!reservations.some((reservation) => reservation.id === reservationId)) {
      throw new Error("Select an existing reservation before marking this target booked.");
    }
    return {
      ...value,
      status: "booked",
      linkedReservationId: reservationId,
      attempts: appendAttempt(value, {
        id: action.attemptId,
        attemptedOn: action.attemptedOn,
        result: "booked",
        note: action.note,
        reservationId,
      }),
    };
  }

  const result: BookingAttemptResult = action.type === "mark_unavailable" ? "unavailable" : "attempted";
  return {
    ...value,
    status: result,
    attempts: appendAttempt(value, {
      id: action.attemptId,
      attemptedOn: action.attemptedOn,
      result,
      note: action.note,
      reservationId: null,
    }),
  };
}

export function summarizeBookingLifecycle(
  target: BookingTarget,
  reservations: readonly ReservationReference[],
): BookingLifecycleSummary {
  const linked = target.linkedReservationId
    ? reservations.find((reservation) => reservation.id === target.linkedReservationId) || null
    : null;
  if (target.status === "booked" && !target.linkedReservationId) {
    return { linkedReservationTitle: null, warning: "Booked state needs a deliberate reservation link." };
  }
  if (target.linkedReservationId && !linked) {
    return { linkedReservationTitle: null, warning: "The linked reservation is no longer available. Review this target without changing stored data." };
  }
  if (target.status !== "booked" && target.linkedReservationId) {
    return { linkedReservationTitle: linked?.title || null, warning: "A reservation link exists outside the booked state. Review this target before another lifecycle change." };
  }
  return { linkedReservationTitle: linked?.title || null, warning: null };
}
