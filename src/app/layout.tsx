import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import { RootProviders } from "@/components/providers/root-providers";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "BudgApp",
  description: "Budget personnel — suivre, budgéter, prévoir.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${instrumentSans.variable} ${ibmPlexMono.variable}`} suppressHydrationWarning>
      <body className="min-h-svh antialiased">
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
