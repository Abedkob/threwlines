import { BillingSettings } from "@/components/settings/BillingSettings";
export const metadata = { title: "Invoice defaults" };
export default function Page() {
  return <BillingSettings only="invoicing" />;
}
