import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Instrument_Serif({ variable: "--font-display", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "CrowdChorus",
  description: "One room. Many voices. One original song.",
};

export const viewport: Viewport = { themeColor: "#0c0b10", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="mx-auto flex w-full max-w-5xl items-center px-4 py-5 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-accent-2"
          >
            <span aria-hidden className="flex h-7 items-end gap-0.5">
              {[3, 6, 4, 7, 5].map((h, i) => (
                <span key={i} className="w-1 rounded-full bg-accent" style={{ height: `${h * 4}px` }} />
              ))}
            </span>
            CrowdChorus
          </Link>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
