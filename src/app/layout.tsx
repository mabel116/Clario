import type { Metadata } from "next";
import "./globals.css";
import { PowerSyncProvider } from "../lib/sync/provider";
import { SyncIndicator } from "../components/SyncIndicator";

export const metadata: Metadata = {
  title: "Clario — Offline-First Freelance Workspace",
  description: "Instant financial clarity and client management for solo creative freelancers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen bg-background text-foreground">
        <PowerSyncProvider>
          {children}
          <SyncIndicator />
        </PowerSyncProvider>
      </body>
    </html>
  );
}
