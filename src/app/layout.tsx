import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";
import InstallPrompt from "@/components/InstallPrompt";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "GraveLens",
  description:
    "Bring the story behind every stone into focus. Photograph any headstone to uncover and preserve their legacy.",
  // manifest.ts handles /manifest.webmanifest — no static reference needed
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GraveLens",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1a1917",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${inter.variable} h-dvh overflow-hidden`}
    >
      <body className="h-dvh flex flex-col bg-[#1a1917] text-[#f5f2ed] font-sans overflow-hidden">
        <ServiceWorkerRegister />
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
