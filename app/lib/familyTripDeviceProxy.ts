export const FAMILY_DEVICE_CREDENTIAL_COOKIE = "castlewatch.family-device-credential.v1";
export const FAMILY_DEVICE_CREDENTIAL_COOKIE_PATH = "/api/castlewatch-family-sync";
export const FAMILY_DEVICE_CREDENTIAL_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const MAX_CREDENTIAL_LENGTH = 512;
const DEVICE_TOKEN_PATTERN = /^cwdev_[A-Za-z0-9_-]{6,24}_[A-Za-z0-9_-]{24,}$/;
const RAW_DEVICE_TOKEN_PATTERN = /cwdev_[A-Za-z0-9_-]{6,24}_[A-Za-z0-9_-]{24,}/g;
const SENSITIVE_DEVICE_KEYS = new Set([
  "deviceToken",
  "rawToken",
  "tokenHash",
  "token_hash",
]);

type HeaderReader = {
  get(name: string): string | null;
};

export function normalizeProtectedDeviceToken(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_CREDENTIAL_LENGTH) return "";
  return DEVICE_TOKEN_PATTERN.test(normalized) ? normalized : "";
}

export function protectedDeviceCredentialCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    path: FAMILY_DEVICE_CREDENTIAL_COOKIE_PATH,
    maxAge: FAMILY_DEVICE_CREDENTIAL_MAX_AGE_SECONDS,
  };
}

export function validateSameOriginJsonRequest(headers: HeaderReader, expectedOrigin: string) {
  const contentType = (headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return "The family sync proxy accepts application/json requests only.";
  }

  const fetchSite = (headers.get("sec-fetch-site") || "").trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") {
    return "The family sync proxy accepts same-origin requests only.";
  }

  const origin = (headers.get("origin") || "").trim();
  if (!origin) {
    return "The family sync proxy requires a same-origin request context.";
  }
  try {
    if (new URL(origin).origin !== new URL(expectedOrigin).origin) {
      return "The family sync proxy accepts same-origin requests only.";
    }
  } catch {
    return "The family sync request origin is invalid.";
  }

  return null;
}

export function sanitizeDeviceCredentialPayload(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(RAW_DEVICE_TOKEN_PATTERN, "[redacted device credential]");
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeDeviceCredentialPayload(entry));
  }
  if (!value || typeof value !== "object") return value;

  const safe: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_DEVICE_KEYS.has(key)) continue;
    safe[key] = sanitizeDeviceCredentialPayload(entry);
  }
  return safe;
}

export function extractOneTimeDeviceCredential(value: unknown) {
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    deviceToken: normalizeProtectedDeviceToken(root.deviceToken),
    safePayload: sanitizeDeviceCredentialPayload(value),
  };
}
