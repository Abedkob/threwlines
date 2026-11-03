import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "idevelopit-vault", template: "%s · idevelopit-vault" },
  description: "One shared place for the team's work, pipeline, and spending.",
  icons: {
    icon: "/idevelopit-vault-logo.jpeg",
    apple: "/idevelopit-vault-logo.jpeg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
