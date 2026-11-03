import { rpc } from "@/lib/db/query";
import {
  bearer,
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
  verifyLicenseToken,
} from "@/lib/license-api";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  const requestId = requestIdOf(request);
  try {
    if (!(await rateLimit(request, "validate", 120))) return failure(request, "RATE_LIMITED", requestId, 429);
    const claims = await verifyLicenseToken(bearer(request));
    const input = await readLicenseBody(request);
    const result = await rpc<Record<string, unknown>>("license_api_validate", [
      claims.aid,
      await hash(requiredString(input.installation_id, 500)),
      requestId,
      await hash(clientIp(request)),
      optionalString(input.application_version, 80),
    ]);
    if (result.ok && String(result.license_id) !== claims.sub) {
      return failure(request, "TOKEN_INVALID", requestId, 401);
    }
    return tokenResponse(request, result, requestId);
  } catch (caught) {
    return caughtFailure(request, caught, requestId);
  }
}
