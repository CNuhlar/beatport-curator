import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { TopNav } from "@/components/top-nav";
import { AuthGate } from "@/components/auth-gate";
import { LLMSetupBanner } from "@/components/llm-setup-banner";

export const metadata: Metadata = {
  title: "Curator — Beatport DJ Workstation",
  description: "Personal DJ set curator — vibe-tagged library, intent-driven playlists",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full overflow-hidden">
      <body className="h-full flex flex-col antialiased overflow-hidden">
        <Providers>
          <TopNav />
          <LLMSetupBanner />
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <AuthGate>{children}</AuthGate>
          </main>
        </Providers>
      </body>
    </html>
  );
}
