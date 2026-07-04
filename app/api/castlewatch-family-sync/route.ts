import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SyncAction = "read" | "write" | "history" | "history_version" | "restore";

type SyncRequestBody = {
  action?: SyncAction;
  key?: string;
  expectedVersion?: number;
  sourceVersion?: number;
  version?: number;
  payload?: unknown;
};

function backendBaseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_API_BASE_URL
    || process.env.NEXT_PUBLIC_BACKEND_URL
    || process.env.NEXT_PUBLIC_BASE_URL
    || "";

  return raw
    .replace(/^Value:\s*/i, "")
    .trim()
    .replace(/\/$/, "");
}

function validAction(value: unknown): value is SyncAction {
  return value === "read"
    || value === "write"
    || value === "history"
    || value === "history_version"
    || value === "restore";
}

export async function POST(request: NextRequest) {
  const baseUrl = backendBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({
      status: "proxy_not_configured",
      message: "CastleWatch backend URL is missing from the Vercel environment.",
    }, { status: 503 });
  }

  let body: SyncRequestBody;
  try {
    body = await request.json() as SyncRequestBody;
  } catch {
    return NextResponse.json({
      status: "invalid_request",
      message: "The family sync request was not valid JSON.",
    }, { status: 400 });
  }

  const action = body.action;
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!validAction(action) || !key) {
    return NextResponse.json({
      status: "invalid_request",
      message: "The family sync action or key is missing.",
    }, { status: 400 });
  }

  let upstreamMethod: "GET" | "PUT" | "POST" = "GET";
  let upstreamPath = "/api/family-trip";
  let upstreamBody: string | undefined;

  if (action === "write") {
    upstreamMethod = "PUT";
    upstreamBody = JSON.stringify({
      expectedVersion: body.expectedVersion,
      payload: body.payload,
    });
  } else if (action === "history") {
    upstreamPath = "/api/family-trip/history";
  } else if (action === "history_version") {
    if (!Number.isInteger(body.version) || (body.version as number) < 1) {
      return NextResponse.json({
        status: "invalid_request",
        message: "A positive history version is required.",
      }, { status: 400 });
    }
    upstreamPath = `/api/family-trip/history/${body.version}`;
  } else if (action === "restore") {
    upstreamMethod = "POST";
    upstreamPath = "/api/family-trip/restore";
    upstreamBody = JSON.stringify({
      expectedVersion: body.expectedVersion,
      sourceVersion: body.sourceVersion,
    });
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-CastleWatch-Key": key,
    };
    if (upstreamBody !== undefined) headers["Content-Type"] = "application/json";

    const upstream = await fetch(`${baseUrl}${upstreamPath}`, {
      method: upstreamMethod,
      cache: "no-store",
      headers,
      body: upstreamBody,
    });

    const responseText = await upstream.text();
    let responseData: unknown;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = {
        status: "upstream_non_json",
        message: `Railway returned HTTP ${upstream.status} with a non-JSON response.`,
        upstreamPreview: responseText.slice(0, 300),
      };
    }

    return NextResponse.json(responseData, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return NextResponse.json({
      status: "proxy_error",
      message: error instanceof Error
        ? `Vercel could not reach the CastleWatch backend: ${error.message}`
        : "Vercel could not reach the CastleWatch backend.",
    }, { status: 502 });
  }
}
