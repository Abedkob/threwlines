import { redirect } from "next/navigation";

// Settings is a set of modules now; land on the first one.
export default function SettingsPage() {
  redirect("/settings/company");
}
