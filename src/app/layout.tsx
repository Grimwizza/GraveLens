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
  title: "GraveLens — Bring the story behind every stone into focus",
  description:
    "Photograph any headstone to travel through history and reveal a lifetime of memories. Discover the unique stories and legacies within every stone.",
  openGraph: {
    title: "GraveLens — Bring the story behind every stone into focus",
    description: "Photograph any headstone to travel through history and reveal a lifetime of memories.",
    url: "https://www.gravelens.com",
    siteName: "GraveLens",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "GraveLens Lifestyle Mockup",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GraveLens — Bring the story behind every stone into focus",
    description: "Photograph any headstone to travel through history and reveal a lifetime of memories.",
    images: ["/opengraph-image.png"],
  },
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
      className={`${playfair.variable} ${inter.variable} overflow-hidden`}
      suppressHydrationWarning
    >
      <body className="flex flex-col h-full bg-[#1a1917] text-[#f5f2ed] font-sans overflow-hidden">
        <ServiceWorkerRegister />
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
