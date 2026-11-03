import { BillingSettings } from "@/components/settings/BillingSettings";
export const metadata = { title: "Payment methods" };
export default function Page() {
  return <BillingSettings only="payments" />;
}
