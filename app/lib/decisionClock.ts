// A separate clock subscription must not depend on local-storage changes.
// An open, active page re-evaluates aging signals at least once a minute.
export function subscribeDecisionClock(
  publish: (nowIso: string) => void,
  runtime: Pick<Window, "setInterval" | "clearInterval" | "addEventListener" | "removeEventListener">,
  now: () => Date = () => new Date(),
) {
  const tick = () => publish(now().toISOString());
  tick();
  const interval = runtime.setInterval(tick, 60_000);
  runtime.addEventListener("focus", tick);
  runtime.addEventListener("pageshow", tick);
  return () => {
    runtime.clearInterval(interval);
    runtime.removeEventListener("focus", tick);
    runtime.removeEventListener("pageshow", tick);
  };
}
