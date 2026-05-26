"use client";

import { useEffect, useState } from "react";
import { checkBackendStatus, API_BASE_URL, type ApiResult } from "../lib/api";

export default function BackendStatus() {
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);

  async function runCheck() {
    setLoading(true);
    const next = await checkBackendStatus();
    setResult(next);
    setLoading(false);
  }

  useEffect(() => {
    runCheck();
  }, []);

  const dot = loading ? "warn" : result?.ok ? "good" : "bad";
  const label = loading ? "Checking backend..." : result?.ok ? "Backend connected" : "Backend not connected";

  return (
    <div className="card half">
      <h2>Backend Connection</h2>
      <div className="status-row">
        <span className={`dot ${dot}`} />
        <strong>{label}</strong>
      </div>

      <p className="muted">
        This checks whether the Vercel frontend can reach your public Railway backend URL.
      </p>

      <div className="code">
        NEXT_PUBLIC_API_BASE_URL: {API_BASE_URL || "missing"}
      </div>

      {result?.url && (
        <p className="muted">
          Checked: <span className="code">{result.url}</span>
        </p>
      )}

      {result?.error && <p className="muted">Message: {result.error}</p>}

      <button className="button" onClick={runCheck}>
        Test again
      </button>
    </div>
  );
}
