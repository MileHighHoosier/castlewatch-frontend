"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { fetchShowTimes, type ParkShow } from "../lib/api";
import { getActiveWeatherRiskMode } from "../lib/weatherRisk";

const KEY = "castlewatch.currentParkContext.v1";
type Status = "idle" | "heading" | "arrived" | "in_line";
type Context = { land: string; activity: string; status: Status; startedAt?: string };

const EMPTY: Context = { land: "", activity: "", status: "idle" };
const LANDS: Record<string, string[]> = {
  "Magic Kingdom": ["Main Street, U.S.A.", "Adventureland", "Frontierland", "Liberty Square", "Fantasyland", "Tomorrowland"],
  Epcot: ["World Celebration", "World Discovery", "World Nature", "World Showcase"],
  "Hollywood Studios": ["Hollywood Boulevard", "Echo Lake", "Grand Avenue", "Star Wars: Galaxy's Edge", "Toy Story Land", "Animation Courtyard", "Sunset Boulevard"],
  "Animal Kingdom": ["The Oasis", "Discovery Island", "Pandora – The World of Avatar", "Africa", "Asia", "DinoLand U.S.A.", "Rafiki's Planet Watch"],
};
const INDOOR = ["philharmagic", "hall of presidents", "carousel of progress", "frozen sing-along", "festival of the lion king", "finding nemo", "american adventure", "turtle talk", "pixar short film"];

function readAll(): Record<string, Context> {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function save(park: string, value: Context) {
  const all = readAll(); all[park] = value; localStorage.setItem(KEY, JSON.stringify(all));
}
function clock(value?: string) {
  if (!value) return ""; const date = new Date(value); return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function statusText(status: Status) {
  return status === "heading" ? "Heading there" : status === "arrived" ? "Arrived" : status === "in_line" ? "In line / waiting" : "No active activity";
}
function nextShow(shows: ParkShow[]) {
  const now = Date.now();
  return shows.flatMap((show) => (show.times || []).map((time) => ({ show, time: time.startTime ? new Date(time.startTime) : null })))
    .filter((item) => item.time && !Number.isNaN(item.time.getTime()) && item.time.getTime() > now)
    .sort((a, b) => a.time!.getTime() - b.time!.getTime())[0] || null;
}

export default function CurrentParkContext({ selectedPark }: { selectedPark: string }) {
  const [context, setContext] = useState<Context>(EMPTY);
  const [draft, setDraft] = useState("");
  const [shows, setShows] = useState<ParkShow[]>([]);
  const [loadedPark, setLoadedPark] = useState("");
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const grid = document.querySelector<HTMLElement>(".grid");
    if (!grid) return;
    const node = document.createElement("div");
    node.className = "current-context-mount";
    node.style.display = "contents";
    grid.insertBefore(node, grid.firstChild);
    setMount(node);
    return () => { node.remove(); setMount(null); };
  }, []);

  useEffect(() => {
    const saved = readAll()[selectedPark] || EMPTY;
    setContext(saved); setDraft(saved.activity); setLoadedPark(selectedPark);
  }, [selectedPark]);

  useEffect(() => { if (loadedPark === selectedPark) save(selectedPark, context); }, [context, loadedPark, selectedPark]);

  useEffect(() => {
    let live = true;
    fetchShowTimes(selectedPark).then((result) => {
      if (live) setShows(result.ok && result.data ? result.data.shows || [] : []);
    });
    return () => { live = false; };
  }, [selectedPark]);

  useEffect(() => {
    function onStartRoute(event: MouseEvent) {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(".next-move-card .button");
      if (button?.textContent?.trim().toLowerCase() !== "start route") return;
      const activity = button.closest(".next-move-card")?.querySelector("h3")?.textContent?.trim();
      if (!activity) return;
      const startedAt = new Date().toISOString();
      setDraft(activity); setContext((old) => ({ ...old, activity, status: "heading", startedAt }));
    }
    document.addEventListener("click", onStartRoute);
    return () => document.removeEventListener("click", onStartRoute);
  }, []);

  const opportunity = useMemo(() => nextShow(shows), [shows]);
  const showMessage = useMemo(() => {
    if (!opportunity) return "No upcoming timed show found. CastleWatch will keep checking the live feed.";
    const minutes = Math.round((opportunity.time!.getTime() - Date.now()) / 60000);
    const showLand = opportunity.show.land || "location not provided";
    const weather = getActiveWeatherRiskMode();
    const active = context.status !== "idle" && context.activity;
    const indoor = INDOOR.some((word) => opportunity.show.name.toLowerCase().includes(word));
    let text = `${opportunity.show.name} starts at ${clock(opportunity.time!.toISOString())}, about ${minutes} minutes from now.`;
    if (active) text += ` Finish or skip ${context.activity} before treating this as the next move.`;
    else if (!context.land) text += " Set your current area to judge whether it is practical; no walking time is being estimated.";
    else if (showLand !== "Entertainment" && showLand !== "location not provided") text += ` You are in ${context.land}; the feed lists ${showLand}. Verify the route before committing.`;
    else text += ` Your area is ${context.land}, but the show feed lacks a reliable land. Verify the location.`;
    if (minutes < 10) text += " This is probably too soon unless you are already nearby.";
    if (weather !== "normal") text += indoor ? ` It appears to be an indoor candidate for ${weather === "hot" ? "Heat" : "Storm"} guard.` : " Do not assume this provides A/C or storm shelter.";
    return text;
  }, [context, opportunity]);

  const active = context.status !== "idle" && Boolean(context.activity);
  function start() {
    if (!draft.trim()) return;
    setContext((old) => ({ ...old, activity: draft.trim(), status: "heading", startedAt: new Date().toISOString() }));
  }
  function setStatus(status: Status) { setContext((old) => ({ ...old, status, startedAt: old.startedAt || new Date().toISOString() })); }
  function clear() { setContext((old) => ({ ...old, activity: "", status: "idle", startedAt: undefined })); setDraft(""); }

  if (!mount) return null;

  return createPortal(
    <section className="card current-context-card">
      <style>{`
        .current-context-card{display:grid;gap:12px}.current-context-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .current-context-field{display:grid;gap:6px}.current-context-field label{font-size:12px;font-weight:900;color:var(--muted)}
        .current-context-field select,.current-context-field input{min-height:44px;border:1px solid var(--line);border-radius:12px;padding:9px 10px;background:rgba(255,255,255,.06);color:var(--text);font:inherit}
        .current-context-actions{display:flex;flex-wrap:wrap;gap:8px}.current-context-box{border:1px solid var(--line);border-radius:16px;padding:12px;background:rgba(255,255,255,.04)}
        .current-context-show{border-color:rgba(142,197,255,.4);background:rgba(142,197,255,.08)}@media(max-width:640px){.current-context-grid{grid-template-columns:1fr}}
      `}</style>
      <div><h2>Current context</h2><p className="muted">Confirm meaningful changes only. CastleWatch will not invent precise walking times.</p></div>
      <div className="current-context-grid">
        <div className="current-context-field"><label>Current area</label><select value={context.land} onChange={(e) => setContext((old) => ({ ...old, land: e.target.value }))}><option value="">Not set</option>{(LANDS[selectedPark] || []).map((land) => <option key={land}>{land}</option>)}</select></div>
        <div className="current-context-field"><label>Current or next activity</label><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Example: Peter Pan's Flight" /></div>
      </div>
      <div className="current-context-actions">
        <button className="button" type="button" onClick={start} disabled={!draft.trim()}>Start</button>
        <button className="button secondary-button" type="button" onClick={() => setStatus("arrived")} disabled={!active}>Arrived</button>
        <button className="button secondary-button" type="button" onClick={() => setStatus("in_line")} disabled={!active}>In line</button>
        <button className="button secondary-button" type="button" onClick={clear} disabled={!active}>Finished</button>
        <button className="button secondary-button" type="button" onClick={clear} disabled={!active}>Skip</button>
      </div>
      <div className="current-context-box"><strong>{statusText(context.status)}</strong><p className="muted">{active ? `${context.activity} · started ${clock(context.startedAt)}${context.land ? ` · ${context.land}` : " · area not set"}` : context.land ? `Area confirmed: ${context.land}. No active activity.` : "Set your area when you want location-aware guidance."}</p></div>
      <div className="current-context-box current-context-show"><strong>Next show opportunity</strong><p className="muted">{showMessage}</p></div>
    </section>,
    mount,
  );
}
