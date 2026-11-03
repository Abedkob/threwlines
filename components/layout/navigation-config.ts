import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CheckSquare2,
  ContactRound,
  FileText,
  Landmark,
  LayoutDashboard,
  KeyRound,
  PanelsTopLeft,
  Repeat2,
  Settings2,
  WalletCards,
} from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  badge?: "contacts" | "tasks";
  /** Sub-pages, revealed in the sidebar while this section is open. */
  children?: { href: string; label: string }[];
};

export type NavigationGroup = {
  label: string;
  links: NavigationItem[];
};

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Workspace",
    links: [
      { href: "/dashboard", label: "Dashboard", description: "Workspace pulse", icon: LayoutDashboard },
      { href: "/contacts", label: "Contacts", description: "People and context", icon: ContactRound, badge: "contacts" },
      { href: "/pipeline", label: "Pipeline", description: "Active opportunities", icon: BarChart3 },
      { href: "/tasks", label: "Tasks", description: "Work in motion", icon: CheckSquare2, badge: "tasks" },
      { href: "/expenses", label: "Expenses", description: "Spending ledger", icon: WalletCards },
    ],
  },
  {
    label: "Billing",
    links: [
      { href: "/contracts", label: "Contracts", description: "Recurring agreements", icon: Repeat2 },
      { href: "/invoices", label: "Invoices", description: "Billing and receipts", icon: FileText },
      { href: "/payments", label: "Payments", description: "Customer cashbook", icon: Landmark },
      { href: "/templates", label: "Templates", description: "Document system", icon: PanelsTopLeft },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/licensing", label: "Licensing", description: "Products and access", icon: KeyRound },
      {
        href: "/settings",
        label: "Settings",
        description: "Workspace controls",
        icon: Settings2,
        children: [
          { href: "/settings/company", label: "Company profile" },
          { href: "/settings/invoicing", label: "Invoice defaults" },
          { href: "/settings/payments", label: "Payment methods" },
          { href: "/settings/services", label: "Services" },
          { href: "/settings/categories", label: "Expense categories" },
        ],
      },
    ],
  },
];

export const mobilePrimaryItems = [
  navigationGroups[0].links[0],
  navigationGroups[0].links[1],
  navigationGroups[0].links[3],
];

export function navigationItemIsActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
