import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SyncRequestBody = {
  action?: "read" | "write";
  key?: string;
  expectedVersion?: number;
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
  if ((action !== "read" && action !== "write") || !key) {
    return NextResponse.json({
      status: "invalid_request",
      message: "The family sync action or key is missing.",
    }, { status: 400 });
  }

  try {
    const upstreamMethod = action === "read" ? "GET" : "PUT";
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-CastleWatch-Key": key,
    };

    let upstreamBody: string | undefined;
    if (action === "write") {
      headers["Content-Type"] = "application/json";
      upstreamBody = JSON.stringify({
        expectedVersion: body.expectedVersion,
        payload: body.payload,
      });
    }

    const upstream = await fetch(`${baseUrl}/api/family-trip`, {
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
