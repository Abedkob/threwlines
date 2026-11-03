import { SettingsClient } from "@/components/settings/SettingsClient";
export const metadata = { title: "Expense categories" };
export default function Page() {
  return <SettingsClient only="categories" />;
}
