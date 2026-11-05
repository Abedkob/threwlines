import { caughtFailure, licenseResponse, preflight, requestIdOf } from "@/lib/license-api";
import { licenseDiscovery } from "@/lib/license-discovery";

// GET /api/license/v1 - the discovery document. A client configured with just
// an origin reads this to learn where the endpoints are, instead of building
// paths from a base URL of its own.

export function OPTIONS(request: Request) {
  return preflight(request);
}

export function GET(request: Request) {
  try {
    return licenseResponse(request, licenseDiscovery());
  } catch (caught) {
    return caughtFailure(request, caught, requestIdOf(request));
  }
}
