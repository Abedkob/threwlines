import { publicJwks } from "@/lib/auth/license-token";
import { caughtFailure, licenseResponse, preflight, requestIdOf } from "@/lib/license-api";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export function GET(request: Request) {
  try {
    return licenseResponse(request, publicJwks());
  } catch (caught) {
    return caughtFailure(request, caught, requestIdOf(request));
  }
}
