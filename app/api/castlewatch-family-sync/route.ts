import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SyncAction =
  | "read"
  | "write"
  | "history"
  | "history_version"
  | "restore"
  | "operations"
  | "device_access_check"
  | "device_list"
  | "device_invite_create"
  | "device_invite_accept"
  | "device_rename"
  | "device_revoke";

type SyncRequestBody = {
  action?: SyncAction;
  key?: string;
  deviceToken?: string;
  inviteToken?: string;
  deviceName?: string;
  deviceId?: string;
  displayName?: string;
  role?: string;
  label?: string;
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
    || value === "restore"
    || value === "operations"
    || value === "device_access_check"
    || value === "device_list"
    || value === "device_invite_create"
    || value === "device_invite_accept"
    || value === "device_rename"
    || value === "device_revoke";
}

function requiresFamilyAccess(action: SyncAction) {
  return action !== "device_invite_accept";
}

function legacyKeyOnly(action: SyncAction) {
  return action === "read"
    || action === "write"
    || action === "history"
    || action === "history_version"
    || action === "restore"
    || action === "operations";
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
  const deviceToken = typeof body.deviceToken === "string" ? body.deviceToken.trim() : "";
  if (!validAction(action)) {
    return NextResponse.json({
      status: "invalid_request",
      message: "The family sync action is missing.",
    }, { status: 400 });
  }
  if (legacyKeyOnly(action) && !key) {
    return NextResponse.json({
      status: "invalid_request",
      message: "The family sync key is missing.",
    }, { status: 400 });
  }
  if (requiresFamilyAccess(action) && !key && !deviceToken) {
    return NextResponse.json({
      status: "invalid_request",
      message: "A family key or device token is required.",
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
  } else if (action === "operations") {
    upstreamPath = "/api/family-trip/operations";
  } else if (action === "device_access_check") {
    upstreamPath = "/api/family-trip/devices/access";
  } else if (action === "device_list") {
    upstreamPath = "/api/family-trip/devices";
  } else if (action === "device_invite_create") {
    upstreamMethod = "POST";
    upstreamPath = "/api/family-trip/invites";
    upstreamBody = JSON.stringify({
      role: body.role,
      label: body.label,
    });
  } else if (action === "device_invite_accept") {
    upstreamMethod = "POST";
    upstreamPath = "/api/family-trip/devices/accept-invite";
    upstreamBody = JSON.stringify({
      inviteToken: body.inviteToken,
      deviceName: body.deviceName,
    });
  } else if (action === "device_rename") {
    upstreamMethod = "POST";
    upstreamPath = "/api/family-trip/devices/rename";
    upstreamBody = JSON.stringify({
      deviceId: body.deviceId,
      displayName: body.displayName,
    });
  } else if (action === "device_revoke") {
    upstreamMethod = "POST";
    upstreamPath = "/api/family-trip/devices/revoke";
    upstreamBody = JSON.stringify({
      deviceId: body.deviceId,
    });
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (key) headers["X-CastleWatch-Key"] = key;
    if (!key && deviceToken) headers["X-CastleWatch-Device-Token"] = deviceToken;
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
