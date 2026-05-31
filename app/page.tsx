import BackendStatus from "./components/BackendStatus";
import RideDataPanel from "./components/RideDataPanel";
import HeatMapPreview from "./components/HeatMapPreview";
import TransportationPlanner from "./components/TransportationPlanner";

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <div className="eyebrow">CastleWatch Phase One</div>
        <h1>Disney demand dashboard foundation</h1>
        <p>
          A mobile-first frontend for checking backend health, testing ride data,
          planning free Disney transportation, and preparing for future park heat maps
          and demand forecasting.
        </p>
      </section>

      <section className="grid">
        <BackendStatus />
        <TransportationPlanner />
        <RideDataPanel />

        <div className="card third">
          <h3>Current phase</h3>
          <p className="muted">
            Prove the frontend can reliably connect to Railway before adding complicated predictions.
          </p>
        </div>

        <div className="card third">
          <h3>Trip use case</h3>
          <p className="muted">
            Designed for repeated phone checks during a 7-day Disney trip.
          </p>
        </div>

        <div className="card third">
          <h3>Next milestone</h3>
          <p className="muted">
            Add real park areas, wait-time history, transportation routing, and backend-generated demand scores.
          </p>
        </div>

        <HeatMapPreview />
      </section>

      <p className="footer">
        CastleWatch · Frontend on Vercel · Backend on Railway
      </p>
    </main>
  );
}
