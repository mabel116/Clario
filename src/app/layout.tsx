import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "../components/ThemeProvider";
import { AuthProvider } from "../lib/auth/provider";
import { PowerSyncProvider } from "../lib/sync/provider";
import { PWARegistration } from "../components/PWARegistration";
import { ToastProvider } from "../components/Toast";

export const metadata: Metadata = {
  title: "Clario — Offline-First Freelance Workspace",
  description: "Instant financial clarity and client management for solo creative freelancers.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-background text-foreground" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <AuthProvider>
            <PowerSyncProvider>
              <ToastProvider>
                {children}
                <PWARegistration />
              </ToastProvider>
            </PowerSyncProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
