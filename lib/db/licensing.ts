import type {
  IssuedLicense,
  License,
  LicenseActivation,
  LicenseEvent,
  LicensedProduct,
} from "@/types/db";
import { query, queryOne, rpc } from "./query.ts";
import { invalidateBrowserQueries } from "../query-cache.ts";

function notifyLicensingChanged() {
  if (typeof window === "undefined") return;
  invalidateBrowserQueries();
  window.dispatchEvent(new Event("idevelopit-vault:licensing-changed"));
  window.dispatchEvent(new Event("idevelopit-vault:data-changed"));
}

function licenseNumbers(row: any) {
  return {
    ...row,
    active_activations: Number(row.active_activations),
    total_activations: Number(row.total_activations),
    max_activations: Number(row.max_activations),
  };
}

export async function listLicensedProducts() {
  const { rows } = await query<LicensedProduct>(
    "select * from licensed_products order by active desc, name",
  );
  return rows;
}

export async function saveLicensedProduct(
  userId: string,
  product: Partial<LicensedProduct>,
  id?: string | null,
) {
  const result = await rpc<string>("save_licensed_product", [userId, product, id ?? null]);
  notifyLicensingChanged();
  return result;
}

export async function listLicenses() {
  const { rows } = await query<any>("select * from license_registry order by created_at desc");
  return rows.map(licenseNumbers) as License[];
}

export async function listContactLicenses(contactId: string) {
  const { rows } = await query<any>(
    "select * from license_registry where contact_id = $1 order by created_at desc",
    [contactId],
  );
  return rows.map(licenseNumbers) as License[];
}

export async function getLicenseDetails(licenseId: string) {
  const [license, activations, events] = await Promise.all([
    queryOne<any>("select * from license_registry where id = $1", [licenseId]),
    query<LicenseActivation>(
      "select * from license_activations where license_id = $1 order by last_seen_at desc",
      [licenseId],
    ),
    query<LicenseEvent>(
      "select * from license_events where license_id = $1 order by occurred_at desc limit 100",
      [licenseId],
    ),
  ]);
  if (!license) throw new Error("License not found.");
  return {
    ...licenseNumbers(license),
    activations: activations.rows,
    events: events.rows,
  } as License;
}

export async function issueLicense(userId: string, license: Record<string, unknown>) {
  const result = await rpc<IssuedLicense>("issue_license", [userId, license]);
  notifyLicensingChanged();
  return result;
}

export async function updateLicense(
  userId: string,
  licenseId: string,
  patch: Record<string, unknown>,
) {
  await rpc("admin_update_license", [userId, licenseId, patch]);
  notifyLicensingChanged();
}

export async function deactivateLicenseActivation(
  userId: string,
  activationId: string,
  reason = "Removed by superadmin",
) {
  await rpc("admin_deactivate_license_activation", [userId, activationId, reason]);
  notifyLicensingChanged();
}

export async function resetLicenseActivations(userId: string, licenseId: string) {
  await rpc("admin_reset_license_activations", [userId, licenseId]);
  notifyLicensingChanged();
}

export function maskedLicenseKey(license: Pick<License, "key_prefix" | "key_last_four">) {
  return `${license.key_prefix}-•••••-•••••-${license.key_last_four}`;
}
