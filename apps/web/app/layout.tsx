import type { Metadata } from "next";
import { DM_Sans, Newsreader, Space_Mono } from "next/font/google";

import "./globals.css";

const sans = DM_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-sans",
});

const serif = Newsreader({
  display: "swap",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
});

const mono = Space_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  description:
    "Consera understands your project, watches technology shifts, and explains only the consequences worth acting on.",
  icons: {
    icon: "/favicon.svg",
  },
  metadataBase: new URL("https://consera.grimnej.com"),
  openGraph: {
    description:
      "Evidence-bound project intelligence that stays quiet until a technology shift matters.",
    title: "Consera | Project consequence intelligence",
    type: "website",
  },
  title: "Consera | Know what every technology shift means",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={`${sans.variable} ${serif.variable} ${mono.variable}`} lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
