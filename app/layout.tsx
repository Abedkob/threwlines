import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ThrewLines", template: "%s · ThrewLines" },
  description: "One shared place for the team's work, pipeline, and spending.",
  icons: {
    icon: "/threwlines-mark.svg",
    apple: "/threwlines-mark.svg",
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
