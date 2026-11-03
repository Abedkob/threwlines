import { rpc } from "@/lib/db/query";
import {
  bearer,
  caughtFailure,
  failure,
  hash,
  licenseResponse,
  preflight,
  rateLimit,
  readLicenseBody,
  requestIdOf,
  requiredString,
  verifyLicenseToken,
} from "@/lib/license-api";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export async function POST(request: Request) {
  const requestId = requestIdOf(request);
  try {
    if (!(await rateLimit(request, "deactivate", 30))) return failure(request, "RATE_LIMITED", requestId, 429);
    const claims = await verifyLicenseToken(bearer(request));
    const input = await readLicenseBody(request);
    const result = await rpc<Record<string, unknown>>("license_api_deactivate", [
      claims.aid,
      await hash(requiredString(input.installation_id, 500)),
      requestId,
    ]);
    return result.ok
      ? licenseResponse(request, { ...result, request_id: requestId })
      : failure(request, String(result.code), requestId, 404);
  } catch (caught) {
    return caughtFailure(request, caught, requestId);
  }
}
