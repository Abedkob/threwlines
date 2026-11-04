// License keys look like "TL-<product>-XXXXX-XXXXX-...-XXXXX", where each
// group is five uppercase alphanumerics. Kept out of license-api.ts so it can
// be unit tested: that module imports the database and token layers.

export const LICENSE_KEY_RE = /^TL-[A-Z0-9]+(?:-[A-Z0-9]{5}){4,10}$/;

// Keys are typed, pasted and read aloud, so case is not meaningful. The
// activate function hashes digest(upper(trim(key))), so a lowercase key always
// would have matched the stored digest - it was the pattern check in front of
// the lookup that refused it, which surfaced as LICENSE_INVALID and looked
// exactly like a wrong key.
export function normalizeLicenseKey(key: string): string {
  return key.trim().toUpperCase();
}
