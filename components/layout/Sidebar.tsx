"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import {
  navigationGroups,
  navigationItemIsActive,
} from "@/components/layout/navigation-config";
import { apiFetch } from "@/lib/api/client";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function Sidebar({
  user,
  open,
  mobile,
  collapsed,
  badges,
  onClose,
  onToggleCollapsed,
}: {
  user: { name: string; email: string; color: string };
  open: boolean;
  mobile: boolean;
  collapsed: boolean;
  badges: { contacts: number; tasks: number };
  onClose: () => void;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside
      id="primary-sidebar"
      className={`sidebar ${open ? "sidebar-open" : ""} ${collapsed && !mobile ? "sidebar-collapsed" : ""}`}
      aria-label="Workspace navigation"
      aria-hidden={mobile && !open}
      inert={mobile && !open}
    >
      <div className="sidebar-brand">
        <Link href="/dashboard" className="sidebar-brand-link" onClick={onClose} aria-label="ThrewLines dashboard">
          <span className="brand-logo-frame p-1" aria-hidden="true"><img src="/threwlines-bars.svg" alt="" className="scale-100 object-contain" /></span>
          <span className="brand-copy"><strong>ThrewLines</strong><small>workspace</small></span>
        </Link>
        <button className="sidebar-collapse-toggle" onClick={onToggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        <button className="sidebar-close" onClick={onClose} aria-label="Close navigation"><X size={19} /></button>
      </div>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navigationGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-label"><span>{group.label}</span><i /></p>
            <div className="nav-group-links">
              {group.links.map(({ href, label, description, icon: Icon, badge }) => {
                const active = navigationItemIsActive(pathname, href);
                const count = badge ? badges[badge] : 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    className={`nav-link ${active ? "active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    title={collapsed && !mobile ? label : undefined}
                  >
                    <span className="nav-icon"><Icon size={18} strokeWidth={1.8} /></span>
                    <span className="nav-copy"><strong>{label}</strong><small>{description}</small></span>
                    {count > 0 && <span className="nav-badge" aria-label={`${count} ${badge === "contacts" ? "stale contacts" : "open tasks"}`}>{count > 99 ? "99+" : count}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-user">
        <div className="user-row" title={collapsed && !mobile ? `${user.name} · ${user.email}` : undefined}>
          <span className="avatar" style={{ backgroundColor: user.color }}>{initials(user.name)}</span>
          <span className="user-copy"><small>Signed in as</small><strong>{user.name}</strong><em>{user.email}</em></span>
          <button className="sidebar-signout" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
        </div>
      </div>
    </aside>
  );
}
