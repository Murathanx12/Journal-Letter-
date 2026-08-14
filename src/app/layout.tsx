import type { Metadata, Viewport } from "next";
import {
  Caveat,
  Cormorant_Garamond,
  Courier_Prime,
  Instrument_Serif,
  Inter,
  Literata,
  Lora,
  Schibsted_Grotesk,
} from "next/font/google";

import { ThemeScript } from "@/components/theme/theme-script";

import "./globals.css";

/*
 * Fonts are self-hosted by next/font. Beyond the performance argument, it means
 * a reader's browser never makes a request to Google while they are reading
 * their own private letters.
 */
const literata = Literata({ subsets: ["latin"], variable: "--font-literata", display: "swap" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});
const courierPrime = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-courier-prime",
  display: "swap",
});
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat", display: "swap" });

/*
 * The interface's own two faces, kept separate from the six a reader can choose
 * for their book. A high-contrast display serif for titles and the wordmark,
 * and a crisp grotesque for everything functional — labels, buttons, controls.
 */
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Journal & Letter",
    template: "%s · Journal & Letter",
  },
  description:
    "A private place to write letters and journals that quietly compile themselves into a book.",
  // Only the public marketing pages opt back in; everything under /library and
  // /books is explicitly noindex via next.config.ts headers and route metadata.
  robots: { index: true, follow: true },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e12" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${instrumentSerif.variable} ${schibsted.variable} ${literata.variable} ${lora.variable} ${inter.variable} ${cormorant.variable} ${courierPrime.variable} ${caveat.variable}`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
