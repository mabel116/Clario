import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../lib/auth/provider";
import { PowerSyncProvider } from "../lib/sync/provider";
import { SyncIndicator } from "../components/SyncIndicator";
import { PWARegistration } from "../components/PWARegistration";

export const metadata: Metadata = {
  title: "Clario — Offline-First Freelance Workspace",
  description: "Instant financial clarity and client management for solo creative freelancers.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen bg-background text-foreground" suppressHydrationWarning>
        <AuthProvider>
          <PowerSyncProvider>
            {children}
            <SyncIndicator />
            <PWARegistration />
          </PowerSyncProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

