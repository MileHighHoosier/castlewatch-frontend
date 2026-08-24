import { NextRequest, NextResponse } from "next/server";
import {
  FAMILY_DEVICE_CREDENTIAL_COOKIE,
  extractOneTimeDeviceCredential,
  normalizeProtectedDeviceToken,
  protectRejectedDeviceCredential,
  protectedDeviceCredentialCookieOptions,
  validateSameOriginJsonRequest,
} from "../../lib/familyTripDeviceProxy";

export const dynamic = "force-dynamic";

type DeviceAuthMode = "family_key" | "device_cookie";

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
  | "device_owner_bootstrap"
  | "device_credential_migrate"
  | "device_credential_clear"
  | "device_rename"
  | "device_revoke";

type SyncRequestBody = {
  action?: SyncAction;
  authMode?: DeviceAuthMode;
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
    || value === "device_owner_bootstrap"
    || value === "device_credential_migrate"
    || value === "device_credential_clear"
    || value === "device_rename"
    || value === "device_revoke";
}

function sharedPlanAction(action: SyncAction) {
  return action === "read"
    || action === "write"
    || action === "history"
    || action === "history_version"
    || action === "restore"
    || action === "operations";
}

function deviceManagementAction(action: SyncAction) {
  return action === "device_access_check"
    || action === "device_list"
    || action === "device_invite_create"
    || action === "device_rename"
    || action === "device_revoke";
}

function jsonResponse(payload: unknown, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function clearCredentialCookie(response: NextResponse) {
  response.cookies.set(FAMILY_DEVICE_CREDENTIAL_COOKIE, "", {
    ...protectedDeviceCredentialCookieOptions(),
    maxAge: 0,
  });
}

function setCredentialCookie(response: NextResponse, token: string) {
  response.cookies.set(
    FAMILY_DEVICE_CREDENTIAL_COOKIE,
    token,
    protectedDeviceCredentialCookieOptions(),
  );
}

function protectedCredentialMissingResponse() {
  const response = jsonResponse({
    status: "protected_credential_missing",
    authState: "rejected_device_token",
    message: "The protected device credential is missing. Select family-key recovery explicitly or reconnect this browser.",
  }, 401);
  clearCredentialCookie(response);
  return response;
}

export async function POST(request: NextRequest) {
  const requestError = validateSameOriginJsonRequest(request.headers, request.nextUrl.origin);
  if (requestError) {
    return jsonResponse({ status: "invalid_request", message: requestError }, 400);
  }

  let body: SyncRequestBody;
  try {
    body = await request.json() as SyncRequestBody;
  } catch {
    return jsonResponse({
      status: "invalid_request",
      message: "The family sync request was not valid JSON.",
    }, 400);
  }

  const action = body.action;
  if (!validAction(action)) {
    return jsonResponse({
      status: "invalid_request",
      message: "The family sync action is missing.",
    }, 400);
  }

  if (action === "device_credential_clear") {
    const response = jsonResponse({
      status: "ok",
      message: "The protected device credential was cleared from this browser.",
    }, 200);
    clearCredentialCookie(response);
    return response;
  }

  const baseUrl = backendBaseUrl();
  if (!baseUrl) {
    return jsonResponse({
      status: "proxy_not_configured",
      message: "CastleWatch backend URL is missing from the Vercel environment.",
    }, 503);
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  const submittedDeviceToken = normalizeProtectedDeviceToken(body.deviceToken);
  const protectedDeviceToken = normalizeProtectedDeviceToken(
    request.cookies.get(FAMILY_DEVICE_CREDENTIAL_COOKIE)?.value,
  );
  let upstreamKey = "";
  let upstreamDeviceToken = "";

  if (sharedPlanAction(action)) {
    if (body.deviceToken !== undefined) {
      return jsonResponse({
        status: "invalid_request",
        message: "Raw device credentials are not accepted by shared-plan actions.",
      }, 400);
    }
    if (body.authMode === "family_key") {
      if (!key) {
        return jsonResponse({ status: "invalid_request", message: "The family sync key is missing." }, 400);
      }
      upstreamKey = key;
    } else if (body.authMode === "device_cookie") {
      if (key) {
        return jsonResponse({
          status: "invalid_request",
          message: "Do not send a family key while the protected device credential is selected.",
        }, 400);
      }
      if (!protectedDeviceToken) return protectedCredentialMissingResponse();
      upstreamDeviceToken = protectedDeviceToken;
    } else {
      return jsonResponse({
        status: "invalid_request",
        message: "Select either the protected device credential or family-key recovery explicitly.",
      }, 400);
    }
  } else if (action === "device_owner_bootstrap") {
    if (body.authMode !== "family_key" || !key || body.deviceToken) {
      return jsonResponse({
        status: "invalid_request",
        message: "Owner bootstrap requires an explicit family-key credential.",
      }, 400);
    }
    upstreamKey = key;
  } else if (action === "device_credential_migrate") {
    if (!submittedDeviceToken || key) {
      return jsonResponse({
        status: "invalid_request",
        message: "A valid legacy device credential is required for migration.",
      }, 400);
    }
    upstreamDeviceToken = submittedDeviceToken;
  } else if (deviceManagementAction(action)) {
    if (body.deviceToken) {
      return jsonResponse({
        status: "invalid_request",
        message: "Raw device credentials are accepted only by the one-time migration action.",
      }, 400);
    }
    if (body.authMode === "family_key") {
      if (!key) {
        return jsonResponse({ status: "invalid_request", message: "The family key is missing." }, 400);
      }
      upstreamKey = key;
    } else if (body.authMode === "device_cookie") {
      if (key) {
        return jsonResponse({
          status: "invalid_request",
          message: "Do not send a family key while the protected device credential is selected.",
        }, 400);
      }
      if (!protectedDeviceToken) return protectedCredentialMissingResponse();
      upstreamDeviceToken = protectedDeviceToken;
    } else {
      return jsonResponse({
        status: "invalid_request",
        message: "Select either the protected device credential or family-key recovery explicitly.",
      }, 400);
    }
  }

  let upstreamMethod: "GET" | "PUT" | "POST" = "GET";
  let upstreamPath = "/api/family-trip";
  let upstreamBody: string | undefined;

  if (action === "write") {
    upstreamMethod = "PUT";
    upstreamBody = JSON.stringify({ expectedVersion: body.expectedVersion, payload: body.payload });
  } else if (action === "history") {
    upstreamPath = "/api/family-trip/history";
  } else if (action === "history_version") {
    if (!Number.isInteger(body.version) || (body.version as number) < 1) {
      return jsonResponse({ status: "invalid_request", message: "A positive history version is required." }, 400);
    }
    upstreamPath = `/api/family-trip/history/${body.version}`;
  } else if (action === "restore") {
    upstreamMethod = "POST";
    upstreamPath = "/api/family-trip/restore";
    upstreamBody = JSON.stringify({ expectedVersion: body.expectedVersion, sourceVersion: body.sourceVersion });
  } else if (action === "operations") {
    upstreamPath = "/api/family-trip/operations";
  } else if (action === "device_access_check" || action === "device_credential_migrate") {
    upstreamPath = "/api/family-trip/devices/access";
  } else if (action === "device_list") {
    upstreamPath = "/api/family-trip/devices";
  } else if (action === "device_invite_create") {
    upstreamMethod = "POST";
    upstreamPath = "/api/family-trip/invites";
    upstreamBody = JSON.stringify({ role: body.role, label: body.label });
  } else if (action === "device_invite_accept") {
    upstreamMethod = "POST";
    upstreamPath = "/api/family-trip/devices/accept-invite";
    upstreamBody = JSON.stringify({ inviteToken: body.inviteToken, deviceName: body.deviceName });
  } else if (action === "device_owner_bootstrap") {
    upstreamMethod = "POST";
    upstreamPath = "/api/family-trip/devices/bootstrap-owner";
    upstreamBody = JSON.stringify({ deviceName: body.deviceName });
  } else if (action === "device_rename") {
    upstreamMethod = "POST";
    upstreamPath = "/api/family-trip/devices/rename";
    upstreamBody = JSON.stringify({ deviceId: body.deviceId, displayName: body.displayName });
  } else if (action === "device_revoke") {
    upstreamMethod = "POST";
    upstreamPath = "/api/family-trip/devices/revoke";
    upstreamBody = JSON.stringify({ deviceId: body.deviceId });
  }

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (upstreamKey) headers["X-CastleWatch-Key"] = upstreamKey;
    if (upstreamDeviceToken) headers["X-CastleWatch-Device-Token"] = upstreamDeviceToken;
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
      };
    }

    const establishesCredential = action === "device_invite_accept"
      || action === "device_owner_bootstrap"
      || action === "device_credential_migrate";
    const protectedDeviceSelected = body.authMode === "device_cookie"
      && Boolean(protectedDeviceToken)
      && upstreamDeviceToken === protectedDeviceToken;
    const rejection = protectRejectedDeviceCredential(
      responseData,
      upstream.status,
      protectedDeviceSelected,
    );
    let safePayload = rejection.safePayload;
    let credentialToStore = "";

    if (establishesCredential && upstream.ok) {
      if (action === "device_credential_migrate") {
        credentialToStore = upstreamDeviceToken;
      } else {
        const extracted = extractOneTimeDeviceCredential(responseData);
        credentialToStore = extracted.deviceToken;
        safePayload = extracted.safePayload;
      }
      if (!credentialToStore) {
        return jsonResponse({
          status: "upstream_contract_error",
          message: "The backend did not return a valid device credential for protected storage.",
        }, 502);
      }
    }

    const response = jsonResponse(safePayload, upstream.status);
    if (credentialToStore) setCredentialCookie(response, credentialToStore);

    if (rejection.clearCredential) clearCredentialCookie(response);
    return response;
  } catch {
    return jsonResponse({
      status: "proxy_error",
      message: "Vercel could not reach the CastleWatch backend.",
    }, 502);
  }
}
