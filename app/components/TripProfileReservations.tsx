"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_TRIP_PROFILE,
  RESERVATION_LOCATIONS,
  RESERVATION_TEMPLATES,
  TripProfile,
  TripReservation,
  buildReservationWarnings,
  loadTripProfile,
  newReservation,
  reservationPlan,
  saveReservations,
  saveTripProfile,
} from "../lib/tripProfile";
import { ResortPlan } from "../lib/tripResorts";

const STYLE_ID = "castlewatch-trip-profile-style";

type Props = {
  assignedParks: Record<string, string>;
  resortPlan: ResortPlan;
  reservations: TripReservation[];
  onReservationsChange: (reservations: TripReservation[]) => void;
};

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .trip-profile-shell { border:1px solid rgba(99,164,255,.28); border-radius:16px; margin-bottom:14px; background:rgba(99,164,255,.045); overflow:hidden; }
    .trip-profile-shell > summary { cursor:pointer; list-style:none; padding:13px 14px; display:flex; justify-content:space-between; gap:10px; align-items:center; font-weight:900; }
    .trip-profile-shell > summary::-webkit-details-marker { display:none; }
    .trip-profile-summary-count { border:1px solid rgba(99,164,255,.34); border-radius:999px; padding:4px 8px; font-size:11px; white-space:nowrap; }
    .trip-profile-content { padding:0 14px 14px; }
    .trip-profile-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
    .trip-profile-field span { display:block; color:var(--muted); font-size:10px; font-weight:900; margin-bottom:4px; }
    .trip-profile-field input, .trip-profile-field select, .trip-profile-field textarea { width:100%; border:1px solid rgba(255,255,255,.15); border-radius:9px; padding:8px 9px; background:rgba(0,0,0,.17); color:inherit; font:inherit; }
    .trip-profile-field textarea { min-height:68px; resize:vertical; }
    .trip-profile-checkbox { display:flex; align-items:center; gap:8px; padding-top:20px; }
    .trip-profile-checkbox input { width:auto; }
    .trip-reservation-header { display:flex; justify-content:space-between; align-items:flex-end; gap:10px; margin-top:18px; }
    .trip-reservation-header h3, .trip-reservation-header p { margin-top:0; }
    .trip-reservation-quick { display:flex; flex-wrap:wrap; gap:7px; margin:10px 0 12px; }
    .trip-reservation-quick button, .trip-reservation-add, .trip-reservation-delete { border:1px solid rgba(255,255,255,.14); border-radius:10px; padding:7px 9px; background:rgba(255,255,255,.035); color:inherit; font-weight:800; }
    .trip-reservation-add { border-color:rgba(56,217,150,.4); background:rgba(56,217,150,.07); }
    .trip-reservation-delete { border-color:rgba(255,99,99,.35); color:rgb(255,170,170); }
    .trip-warning-list { display:grid; gap:7px; margin:10px 0; }
    .trip-warning { border-radius:11px; padding:8px 10px; font-size:12px; }
    .trip-warning-conflict { border:1px solid rgba(255,99,99,.42); background:rgba(255,99,99,.08); }
    .trip-warning-warning { border:1px solid rgba(255,184,76,.4); background:rgba(255,184,76,.075); }
    .trip-reservation-list { display:grid; gap:10px; }
    .trip-reservation-card { border:1px solid rgba(255,255,255,.12); border-radius:14px; padding:11px; background:rgba(0,0,0,.09); }
    .trip-reservation-card-confirmed { border-color:rgba(56,217,150,.35); }
    .trip-reservation-card-top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
    .trip-reservation-card-top h4 { margin:0; }
    .trip-reservation-status { border-radius:999px; padding:4px 7px; font-size:10px; font-weight:900; border:1px solid rgba(255,184,76,.4); }
    .trip-reservation-status-confirmed { border-color:rgba(56,217,150,.42); color:rgb(124,239,191); }
    .trip-reservation-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:10px; }
    .trip-reservation-plan { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; margin-top:10px; }
    .trip-reservation-plan-item { border:1px solid rgba(99,164,255,.22); border-radius:10px; padding:8px; background:rgba(99,164,255,.04); }
    .trip-reservation-plan-item span { display:block; color:var(--muted); font-size:10px; font-weight:900; margin-bottom:3px; }
    .trip-reservation-plan-item strong { font-size:13px; }
    .trip-reservation-empty { border:1px dashed rgba(255,255,255,.17); border-radius:12px; padding:14px; color:var(--muted); text-align:center; }
    @media (max-width:700px) {
      .trip-profile-grid, .trip-reservation-grid, .trip-reservation-plan { grid-template-columns:1fr; }
      .trip-reservation-header { align-items:flex-start; flex-direction:column; }
    }
  `;
  document.head.appendChild(style);
}

export default function TripProfileReservations({
  assignedParks,
  resortPlan,
  reservations,
  onReservationsChange,
}: Props) {
  const [profile, setProfile] = useState<TripProfile>({ ...DEFAULT_TRIP_PROFILE });

  useEffect(() => {
    ensureStyle();
    setProfile(loadTripProfile());
  }, []);

  function updateProfile<K extends keyof TripProfile>(key: K, value: TripProfile[K]) {
    const next = { ...profile, [key]: value };
    setProfile(next);
    saveTripProfile(next);
  }

  function commitReservations(next: TripReservation[]) {
    const sorted = [...next].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    onReservationsChange(sorted);
    saveReservations(sorted);
  }

  function addReservation(templateIndex?: number) {
    const template = templateIndex === undefined ? undefined : RESERVATION_TEMPLATES[templateIndex];
    commitReservations([...reservations, newReservation(template)]);
  }

  function updateReservation(id: string, patch: Partial<TripReservation>) {
    commitReservations(reservations.map((reservation) => reservation.id === id ? { ...reservation, ...patch } : reservation));
  }

  function deleteReservation(id: string) {
    commitReservations(reservations.filter((reservation) => reservation.id !== id));
  }

  const warnings = useMemo(
    () => buildReservationWarnings(reservations, assignedParks, profile.noParkHopping),
    [reservations, assignedParks, profile.noParkHopping],
  );
  const confirmed = reservations.filter((reservation) => reservation.status === "confirmed").length;

  return (
    <details className="trip-profile-shell" open>
      <summary>
        <span>Trip Details & Reservations</span>
        <span className="trip-profile-summary-count">{reservations.length} bookings · {confirmed} confirmed</span>
      </summary>

      <div className="trip-profile-content">
        <div className="trip-profile-grid">
          <label className="trip-profile-field">
            <span>Trip name</span>
            <input value={profile.tripName} onChange={(event) => updateProfile("tripName", event.target.value)} />
          </label>
          <label className="trip-profile-field">
            <span>Overall status</span>
            <select value={profile.status} onChange={(event) => updateProfile("status", event.target.value as TripProfile["status"])}>
              <option value="provisional">Provisional</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </label>
          <label className="trip-profile-field">
            <span>Start date</span>
            <input type="date" value={profile.startDate} onChange={(event) => updateProfile("startDate", event.target.value)} />
          </label>
          <label className="trip-profile-field">
            <span>End date</span>
            <input type="date" value={profile.endDate} onChange={(event) => updateProfile("endDate", event.target.value)} />
          </label>
          <label className="trip-profile-field">
            <span>Adults</span>
            <input type="number" min="1" value={profile.adults} onChange={(event) => updateProfile("adults", Number(event.target.value) || 1)} />
          </label>
          <label className="trip-profile-field">
            <span>Children</span>
            <input type="number" min="0" value={profile.children} onChange={(event) => updateProfile("children", Number(event.target.value) || 0)} />
          </label>
          <label className="trip-profile-field">
            <span>Children's ages during trip</span>
            <input placeholder="Example: 7, 10" value={profile.childAges} onChange={(event) => updateProfile("childAges", event.target.value)} />
          </label>
          <label className="trip-profile-checkbox">
            <input type="checkbox" checked={profile.noParkHopping} onChange={(event) => updateProfile("noParkHopping", event.target.checked)} />
            <span>No park hopping</span>
          </label>
          <label className="trip-profile-field" style={{ gridColumn: "1 / -1" }}>
            <span>Trip notes</span>
            <textarea value={profile.notes} onChange={(event) => updateProfile("notes", event.target.value)} />
          </label>
        </div>

        <div className="trip-reservation-header">
          <div>
            <h3>Reservations</h3>
            <p className="muted">Add bookings as provisional, then mark them confirmed after reservations are secured.</p>
          </div>
          <button className="trip-reservation-add" type="button" onClick={() => addReservation()}>+ Custom reservation</button>
        </div>

        <div className="trip-reservation-quick">
          {RESERVATION_TEMPLATES.map((template, index) => (
            <button type="button" key={template.title} onClick={() => addReservation(index)}>+ {template.title}</button>
          ))}
        </div>

        {warnings.length > 0 && (
          <div className="trip-warning-list">
            {warnings.map((warning, index) => (
              <div className={`trip-warning trip-warning-${warning.level}`} key={`${warning.date}-${warning.message}-${index}`}>
                <strong>{warning.level === "conflict" ? "Conflict" : "Timing warning"}:</strong> {warning.message}
              </div>
            ))}
          </div>
        )}

        <div className="trip-reservation-list">
          {reservations.length === 0 && (
            <div className="trip-reservation-empty">No reservations entered yet. Use a quick-add button above.</div>
          )}

          {reservations.map((reservation) => {
            const plan = reservationPlan(reservation, resortPlan);
            return (
              <article className={`trip-reservation-card ${reservation.status === "confirmed" ? "trip-reservation-card-confirmed" : ""}`} key={reservation.id}>
                <div className="trip-reservation-card-top">
                  <div>
                    <h4>{reservation.title}</h4>
                    <div className="muted">{reservation.date} · {reservation.time || "Time not entered"}</div>
                  </div>
                  <span className={`trip-reservation-status ${reservation.status === "confirmed" ? "trip-reservation-status-confirmed" : ""}`}>
                    {reservation.status === "confirmed" ? "Confirmed" : "Provisional"}
                  </span>
                </div>

                <div className="trip-reservation-grid">
                  <label className="trip-profile-field">
                    <span>Name</span>
                    <input value={reservation.title} onChange={(event) => updateReservation(reservation.id, { title: event.target.value })} />
                  </label>
                  <label className="trip-profile-field">
                    <span>Status</span>
                    <select value={reservation.status} onChange={(event) => updateReservation(reservation.id, { status: event.target.value as TripReservation["status"] })}>
                      <option value="provisional">Provisional</option>
                      <option value="confirmed">Confirmed</option>
                    </select>
                  </label>
                  <label className="trip-profile-field">
                    <span>Type</span>
                    <select value={reservation.type} onChange={(event) => updateReservation(reservation.id, { type: event.target.value as TripReservation["type"] })}>
                      <option value="dining">Dining</option>
                      <option value="experience">Experience</option>
                      <option value="tour">Tour</option>
                      <option value="flight">Flight</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="trip-profile-field">
                    <span>Location</span>
                    <select value={reservation.location} onChange={(event) => updateReservation(reservation.id, { location: event.target.value })}>
                      {RESERVATION_LOCATIONS.map((location) => <option key={location} value={location}>{location}</option>)}
                    </select>
                  </label>
                  <label className="trip-profile-field">
                    <span>Date</span>
                    <input type="date" value={reservation.date} onChange={(event) => updateReservation(reservation.id, { date: event.target.value })} />
                  </label>
                  <label className="trip-profile-field">
                    <span>Time</span>
                    <input type="time" value={reservation.time} onChange={(event) => updateReservation(reservation.id, { time: event.target.value })} />
                  </label>
                  <label className="trip-profile-field">
                    <span>Duration (minutes)</span>
                    <input type="number" min="0" step="15" value={reservation.durationMinutes} onChange={(event) => updateReservation(reservation.id, { durationMinutes: Number(event.target.value) || 0 })} />
                  </label>
                  <label className="trip-profile-field">
                    <span>Arrive early (minutes)</span>
                    <input type="number" min="0" step="5" value={reservation.arrivalBufferMinutes} onChange={(event) => updateReservation(reservation.id, { arrivalBufferMinutes: Number(event.target.value) || 0 })} />
                  </label>
                  <label className="trip-profile-field" style={{ gridColumn: "1 / -1" }}>
                    <span>Notes</span>
                    <textarea value={reservation.notes} onChange={(event) => updateReservation(reservation.id, { notes: event.target.value })} />
                  </label>
                </div>

                <div className="trip-reservation-plan">
                  <div className="trip-reservation-plan-item"><span>Origin</span><strong>{plan.origin || "Add trip context"}</strong></div>
                  <div className="trip-reservation-plan-item"><span>Recommended route</span><strong>{plan.route}</strong></div>
                  <div className="trip-reservation-plan-item"><span>Required arrival</span><strong>{plan.requiredArrival || "Not applicable"}</strong></div>
                  <div className="trip-reservation-plan-item"><span>Leave by</span><strong>{plan.leaveBy || "Not applicable"}</strong></div>
                </div>

                <div style={{ marginTop: 10, textAlign: "right" }}>
                  <button className="trip-reservation-delete" type="button" onClick={() => deleteReservation(reservation.id)}>Delete</button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </details>
  );
}
