import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

async function proxyFamilyTrip(request: NextRequest, method: "GET" | "PUT") {
  const baseUrl = backendBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({
      status: "proxy_not_configured",
      message: "CastleWatch backend URL is missing from the Vercel environment.",
    }, { status: 503 });
  }

  const familyKey = request.headers.get("x-castlewatch-key")?.trim() || "";
  if (!familyKey) {
    return NextResponse.json({
      status: "invalid_request",
      message: "The CastleWatch family key is missing.",
    }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-CastleWatch-Key": familyKey,
    };

    let body: string | undefined;
    if (method === "PUT") {
      headers["Content-Type"] = "application/json";
      body = await request.text();
    }

    const upstream = await fetch(`${baseUrl}/api/family-trip`, {
      method,
      cache: "no-store",
      headers,
      body,
    });

    const responseBody = await upstream.text();
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store, max-age=0",
      },
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

export async function GET(request: NextRequest) {
  return proxyFamilyTrip(request, "GET");
}

export async function PUT(request: NextRequest) {
  return proxyFamilyTrip(request, "PUT");
}
