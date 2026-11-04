"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { apiFetch } from "@/lib/api/client";
import type { NavigationCounts } from "@/types/db";

const SIDEBAR_PREFERENCE = "threwlines:sidebar-collapsed";

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; email: string; color: string };
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [badges, setBadges] = useState({ contacts: 0, tasks: 0 });
  const menuButton = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 820px)");
    const compactQuery = window.matchMedia("(min-width: 821px) and (max-width: 1100px)");
    const saved = window.localStorage.getItem(SIDEBAR_PREFERENCE);
    const updateMobile = () => setMobile(mobileQuery.matches);
    const updateCompact = () => {
      if (window.localStorage.getItem(SIDEBAR_PREFERENCE) === null) {
        setCollapsed(compactQuery.matches);
      }
    };
    updateMobile();
    setCollapsed(saved === null ? compactQuery.matches : saved === "true");
    mobileQuery.addEventListener("change", updateMobile);
    compactQuery.addEventListener("change", updateCompact);
    return () => {
      mobileQuery.removeEventListener("change", updateMobile);
      compactQuery.removeEventListener("change", updateCompact);
    };
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    let active = true;
    async function refreshBadges() {
      try {
        const counts = await apiFetch<NavigationCounts>("/api/navigation");
        if (active) setBadges({ contacts: counts.stale_contacts, tasks: counts.open_tasks });
      } catch {
        // Individual pages surface connection failures with actionable context.
      }
    }
    void refreshBadges();
    window.addEventListener("threwlines:data-changed", refreshBadges);
    return () => {
      active = false;
      window.removeEventListener("threwlines:data-changed", refreshBadges);
    };
  }, []);

  useEffect(() => {
    if (!mobile || !menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeButton = document.querySelector<HTMLButtonElement>(".sidebar-close");
    window.requestAnimationFrame(() => closeButton?.focus());
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const sidebar = document.getElementById("primary-sidebar");
      const focusable = sidebar
        ? [...sidebar.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
            .filter((element) => element.offsetParent !== null)
        : [];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyboard);
    };
  }, [menuOpen, mobile]);

  function closeMenu() {
    setMenuOpen(false);
    if (mobile) window.requestAnimationFrame(() => menuButton.current?.focus());
  }

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_PREFERENCE, String(next));
      return next;
    });
  }

  return (
    <div className={`app-shell ${collapsed && !mobile ? "shell-sidebar-compact" : ""}`}>
      <Sidebar
        user={user}
        open={menuOpen}
        mobile={mobile}
        collapsed={collapsed}
        badges={badges}
        onClose={closeMenu}
        onToggleCollapsed={toggleCollapsed}
      />
      {mobile && menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={closeMenu} />}
      <div className="app-frame">
        <TopBar />
        <main className="page-content">{children}</main>
      </div>
      {mobile && (
        <MobileNavigation
          pathname={pathname}
          menuOpen={menuOpen}
          onOpenMenu={() => setMenuOpen(true)}
          menuButtonRef={menuButton}
          badges={badges}
        />
      )}
    </div>
  );
}
