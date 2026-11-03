import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { queryOne } from "@/lib/db/query";

type ProfileRow = { id: string; name: string; email: string; app_role: string; color: string };

export async function GET() {
  const session = await getSession(await cookies());
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const profile = await queryOne<ProfileRow>(
    "select id, name, email, app_role, color from profiles where id = $1",
    [session.userId],
  );
  if (!profile) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    user: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.app_role,
      color: profile.color,
    },
  });
}
