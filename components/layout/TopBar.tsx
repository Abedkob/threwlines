"use client";

import { usePathname } from "next/navigation";

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
  // Longest-prefix first: the matcher takes the first key that matches, and
  // "/settings" would otherwise swallow every module below it.
  "/settings/company": { title: "Company profile", description: "What appears at the top of every invoice.", section: "Settings" },
  "/settings/invoicing": { title: "Invoice defaults", description: "Numbering, currency, due days, and standing terms.", section: "Settings" },
  "/settings/payments": { title: "Payment methods", description: "Cash, OMT and Whish, and who receives each one.", section: "Settings" },
  "/settings/services": { title: "Services", description: "The revenue catalog invoices are built from.", section: "Settings" },
  "/settings/categories": { title: "Expense categories", description: "How spending is grouped in the ledger.", section: "Settings" },
  "/settings": { title: "Settings", description: "Shape services, categories, and workspace defaults.", section: "System" },
  "/licensing": { title: "Licensing", description: "Products, entitlements, and activation policy.", section: "System" },
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
    </header>
  );
}
