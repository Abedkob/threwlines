"use client";

import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";

const titles: Record<string, { title: string; description: string; section: string }> = {
  "/dashboard": { title: "Dashboard", description: "The team's pulse, at a glance.", section: "Workspace" },
  "/contacts": { title: "Contacts", description: "Relationships, context, and next moves.", section: "Workspace" },
  "/pipeline": { title: "Pipeline", description: "Move opportunities toward a decision.", section: "Workspace" },
  "/tasks": { title: "Tasks", description: "The work that keeps momentum moving.", section: "Workspace" },
  "/expenses": { title: "Expenses", description: "Track where the team's money goes.", section: "Workspace" },
  "/contracts": { title: "Contracts", description: "Recurring agreements and billing schedules.", section: "Billing" },
  "/invoices": { title: "Invoices", description: "Billing documents, balances, and receipts.", section: "Billing" },
  "/payments": { title: "Payments", description: "Customer-linked receipts and collection records.", section: "Billing" },
  "/templates": { title: "Templates", description: "Control the design of financial documents.", section: "Billing" },
  "/settings": { title: "Settings", description: "Shape services, categories, and workspace defaults.", section: "System" },
};

export function TopBar() {
  const pathname = usePathname();
  const route = Object.keys(titles).find((key) => pathname === key || pathname.startsWith(`${key}/`));
  const content = titles[route ?? "/dashboard"];

  return (
    <header className="topbar">
      <div className="mobile-shell-brand" aria-label="ThrewLines">
        <span className="brand-logo-frame p-1" aria-hidden="true"><img src="/threwlines-bars.svg" alt="" className="scale-100 object-contain" /></span>
        <span><strong>ThrewLines</strong><small>workspace</small></span>
      </div>
      <div className="topbar-copy">
        <p className="eyebrow">{content.section} <i /> ThrewLines</p>
        <h1>{content.title}</h1>
        <p>{content.description}</p>
      </div>
      <div className="topbar-status" title="Authenticated private workspace">
        <span className="topbar-status-icon"><ShieldCheck size={14} /><i /></span>
        <span><strong>Private workspace</strong><small>Team data connected</small></span>
      </div>
    </header>
  );
}
