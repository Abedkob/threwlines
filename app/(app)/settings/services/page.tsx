import { SettingsClient } from "@/components/settings/SettingsClient";
export const metadata = { title: "Services" };
export default function Page() {
  return <SettingsClient only="services" />;
}
