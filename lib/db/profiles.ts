import type { AppRole, Profile } from "@/types/db";
import { query, queryOne } from "./query.ts";

export async function listProfiles(): Promise<Profile[]> {
  const { rows } = await query<Profile>("select * from profiles order by name");
  return rows;
}

export async function getProfile(id: string): Promise<Profile | null> {
  return queryOne<Profile>("select * from profiles where id = $1", [id]);
}

export async function getCurrentUserRole(userId: string): Promise<AppRole> {
  const profile = await queryOne<Pick<Profile, "app_role">>(
    "select app_role from profiles where id = $1",
    [userId],
  );
  return profile?.app_role === "superadmin" ? "superadmin" : "member";
}
