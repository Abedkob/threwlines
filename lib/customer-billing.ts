import type { CustomerBillingValue } from "@/components/billing/shared/CustomerBillingProfile";
import { apiFetch, jsonBody } from "@/lib/api/client";

export async function syncCustomerBilling(contactId: string, value: CustomerBillingValue) {
  await apiFetch(`/api/contacts/${contactId}`, {
    method: "PATCH",
    ...jsonBody({
      billing_name: value.billing_name.trim() || null,
      billing_contact: value.billing_contact.trim() || null,
      billing_address: value.billing_address.trim() || null,
      email: value.email.trim() || null,
      whatsapp: value.whatsapp.trim() || null,
    }),
  });
}
