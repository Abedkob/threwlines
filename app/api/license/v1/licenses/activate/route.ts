import { rpc } from "@/lib/db/query";
import {
  caughtFailure,
  clientIp,
  failure,
  hash,
  optionalString,
  preflight,
  rateLimit,
  readLicenseBody,
  requestIdOf,
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
    const data = await rpc<Record<string, unknown>>("license_api_activate", [
      requiredString(input.license_key, 200),
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
