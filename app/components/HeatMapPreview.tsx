export default function HeatMapPreview() {
  const zones = [
    {
      name: "Fantasyland",
      pressure: "Medium-high",
      note: "Likely family demand zone. Good first target for morning planning.",
    },
    {
      name: "Tomorrowland",
      pressure: "Medium",
      note: "Useful for Space Mountain, PeopleMover breaks, and indoor A/C routing.",
    },
    {
      name: "Frontierland / Adventureland",
      pressure: "Variable",
      note: "Demand can swing based on parade timing, weather, and nearby attraction downtime.",
    },
  ];

  return (
    <div className="card">
      <h2>Heat Map Preview</h2>
      <p className="muted">
        Phase One shows placeholder demand zones. Phase Two should replace this with real scores from your backend.
      </p>

      <div className="heat-grid">
        {zones.map((zone) => (
          <div className="zone" key={zone.name}>
            <strong>{zone.name}</strong>
            <span>{zone.pressure}</span>
            <p className="muted">{zone.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
