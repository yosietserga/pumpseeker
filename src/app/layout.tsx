import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PumpSeeker — bot de trading de momentum pump (paper)",
  description:
    "Remake 2025 del motor de Yosietserga: detección de pump momentum en Binance con addChange + cadena de criterios + ocurrencias/confirmaciones y paper trading automatizado con TP/SL.",
  keywords: [
    "crypto bot",
    "pump detection",
    "momentum trading",
    "Binance",
    "paper trading",
    "trading bot",
    "volume momentum",
  ],
  authors: [{ name: "PumpSeeker" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "PumpSeeker — pump momentum trading bot",
    description:
      "Detección de inercia explosiva en vivo: stream Binance → motor de criterios → LONG automático con TP/SL (paper).",
    siteName: "PumpSeeker",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
