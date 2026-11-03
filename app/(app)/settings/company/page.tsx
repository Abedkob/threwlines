import { BillingSettings } from "@/components/settings/BillingSettings";
export const metadata = { title: "Company profile" };
export default function Page() {
  return <BillingSettings only="company" />;
}
