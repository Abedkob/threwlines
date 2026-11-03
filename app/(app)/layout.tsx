import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { getSession } from "@/lib/auth/session";
import { getProfile } from "@/lib/db/profiles";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession(await cookies());
  if (!session) redirect("/login");
  const profile = await getProfile(session.userId);
  if (!profile) redirect("/login");

  const user = {
    id: session.userId,
    email: session.email,
    name: profile.name ?? (session.email ? session.email.split("@")[0] : "Team member"),
    color: profile.color ?? "#3D5AF1",
    role: profile.app_role === "superadmin" ? ("superadmin" as const) : ("member" as const),
  };

  return (
    <AuthProvider user={user}>
      <AppShell user={user}>{children}</AppShell>
    </AuthProvider>
  );
}
