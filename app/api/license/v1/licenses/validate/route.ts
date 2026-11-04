import { preflight } from "@/lib/license-api";
import { handleValidate } from "@/lib/license-validate";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = handleValidate;
