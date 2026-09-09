import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AetherAI — Bitget trading desk",
  description: "Autonomous agentic trading intelligence for Bitget Hackathon Season 2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
