import { preflight } from "@/lib/license-api";
import { handleValidate } from "@/lib/license-validate";

// An alias for /licenses/validate, kept because clients shipped against the
// previous Supabase endpoint poll this path on a timer.
export function OPTIONS(request: Request) {
  return preflight(request);
}

export const POST = handleValidate;
