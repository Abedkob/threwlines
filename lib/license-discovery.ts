// Served at GET /api/license/v1. A client stores one origin and asks the
// server where the endpoints are, instead of building paths itself. Kept free
// of imports so it can be unit tested: the route modules it feeds reach the
// database and token layers through the "@/" alias, which the test runner
// does not resolve.

export const LICENSE_API_BASE_PATH = "/api/license/v1";

// Mirrors lib/auth/license-token.ts. Duplicated rather than imported for the
// reason above; license-discovery.test.ts reads that file and fails if the
// two drift.
const ISSUER = "nosterys";
const ALGORITHM = "ES256";

export type LicenseDiscovery = {
  ok: true;
  service: string;
  api_version: string;
  base_path: string;
  endpoints: Record<"activate" | "validate" | "heartbeat" | "deactivate" | "jwks", string>;
  token: { issuer: string; algorithm: string };
  spec: string;
  documentation: string;
};

export function licenseDiscovery(): LicenseDiscovery {
  return {
    ok: true,
    service: "nosterys-licensing",
    api_version: "v1",
    base_path: LICENSE_API_BASE_PATH,
    endpoints: {
      activate: `${LICENSE_API_BASE_PATH}/licenses/activate`,
      validate: `${LICENSE_API_BASE_PATH}/licenses/validate`,
      heartbeat: `${LICENSE_API_BASE_PATH}/licenses/heartbeat`,
      deactivate: `${LICENSE_API_BASE_PATH}/licenses/deactivate`,
      jwks: `${LICENSE_API_BASE_PATH}/.well-known/jwks.json`,
    },
    token: { issuer: ISSUER, algorithm: ALGORITHM },
    spec: "/licensing-openapi.json",
    documentation: "/licensing-docs.html",
  };
}
