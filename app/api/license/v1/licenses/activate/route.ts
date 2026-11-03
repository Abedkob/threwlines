import { rpc } from "@/lib/db/query";
import {
  caughtFailure,
  clientIp,
  failure,
  hash,
  optionalString,
  preflight,
  rateLimit,
  rateLimitByLicenseKey,
  readLicenseBody,
  requestIdOf,
  requiredLicenseKey,
  requiredString,
  tokenResponse,
} from "@/lib/license-api";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  const requestId = requestIdOf(request);
  try {
    if (!(await rateLimit(request, "activate", 30))) return failure(request, "RATE_LIMITED", requestId, 429);
    const input = await readLicenseBody(request);
    const installationId = requiredString(input.installation_id, 500);
    const licenseKey = requiredLicenseKey(input.license_key);
    // Second axis: cap guessing attempts against a single license key, so
    // brute force spread across many IPs is still bounded.
    if (!(await rateLimitByLicenseKey(licenseKey, "activate", 60))) {
      return failure(request, "RATE_LIMITED", requestId, 429);
    }
    const data = await rpc<Record<string, unknown>>("license_api_activate", [
      licenseKey,
      requiredString(input.product_code, 40),
      await hash(installationId),
      optionalString(input.device_label, 120),
      optionalString(input.platform, 80),
      optionalString(input.application_version, 80),
      requestId,
      await hash(clientIp(request)),
    ]);
    return tokenResponse(request, data, requestId);
  } catch (caught) {
    return caughtFailure(request, caught, requestId);
  }
}
