// Stable across app versions: every browser path that replaces booking targets
// must participate, including an explicit shared-plan download or restore.
export const BOOKING_TARGETS_WRITE_LOCK = "castlewatch.booking-targets.v1.write";
export const BOOKING_TARGETS_UPDATED_EVENT = "castlewatch:booking-targets-updated";

export async function withBookingTargetsWriteLock<T>(write: () => T | Promise<T>): Promise<T> {
  const locks = typeof window === "undefined" ? undefined : window.navigator?.locks;
  if (!locks?.request) {
    throw new Error("This browser cannot safely coordinate planning changes across tabs. Use an updated browser over HTTPS; nothing was saved.");
  }
  return locks.request(BOOKING_TARGETS_WRITE_LOCK, { mode: "exclusive" }, write);
}
