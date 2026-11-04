import { rpc } from "@/lib/db/query";
import {
  bearer,
  caughtFailure,
  clientIp,
  failure,
  hash,
  optionalString,
  rateLimit,
  readLicenseBody,
  requestIdOf,
  requiredString,
  tokenResponse,
  verifyLicenseToken,
} from "@/lib/license-api";

// Shared by /licenses/validate and /licenses/heartbeat. They were one handler
// in the Supabase Edge Function this replaced, and clients in the field poll
// either name, so the two must stay behaviourally identical. Keeping the body
// here rather than re-exporting one route's POST from the other means neither
// route can quietly grow its own rules.
export async function handleValidate(request: Request): Promise<Response> {
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
