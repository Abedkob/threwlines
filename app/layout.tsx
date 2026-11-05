import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Nosterys Vault", template: "%s · Nosterys Vault" },
  description: "One shared place for the team's work, pipeline, and spending.",
  icons: {
    icon: "/nosterys-mark.svg",
    apple: "/nosterys-mark.svg",
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
