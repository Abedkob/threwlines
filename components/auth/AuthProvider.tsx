"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AppRole } from "@/types/db";

export type AuthUser = { id: string; name: string; email: string; role: AppRole; color: string };

const AuthContext = createContext<{ user: AuthUser | null }>({ user: null });

export function AuthProvider({ user, children }: { user: AuthUser | null; children: ReactNode }) {
  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>;
}

export function useAuth(): { user: AuthUser } {
  const { user } = useContext(AuthContext);
  if (!user) throw new Error("useAuth must be used inside an authenticated AuthProvider.");
  return { user };
}
