import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAMA CARE — Facility Dashboard",
  description:
    "Supervisor dashboard for maternal health: ANC attendance, alerts, missed visits, referrals.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
