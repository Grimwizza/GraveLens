"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { recordActiveDay } from "@/lib/achievements";

const tabs = [
  {
    href: "/",
    label: "Scan",
    icon: (active: boolean) => (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? "#c9a84c" : "#8a8580"}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M3 9V6a1 1 0 0 1 1-1h3M21 9V6a1 1 0 0 0-1-1h-3M3 15v3a1 1 0 0 0 1 1h3M21 15v3a1 1 0 0 1-1 1h-3" />
      </svg>
    ),
  },
  {
    href: "/archive",
    label: "Archive",
    icon: (active: boolean) => (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? "#c9a84c" : "#8a8580"}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z" />
        <path d="M3 12h18M3 18h18M7 12v6M12 12v6M17 12v6" />
      </svg>
    ),
  },
  {
    href: "/map",
    label: "Map",
    icon: (active: boolean) => (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? "#c9a84c" : "#8a8580"}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7z" strokeLinejoin="round" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    ),
  },
  {
    href: "/achievements",
    label: "Explorer",
    icon: (active: boolean) => (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? "#c9a84c" : "#8a8580"}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M8 8H4l2 8h12l2-8h-4" />
        <path d="M9 16l1 4h4l1-4" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  useEffect(() => {
    recordActiveDay();
  }, []);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="bg-stone-900/95 backdrop-blur-md border-t border-stone-700/50">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-4">
          {tabs.map((tab) => {
            const isActive =
              tab.href === "/"
                ? pathname === "/" || pathname.startsWith("/result")
                : pathname === tab.href || pathname.startsWith(tab.href + "/");

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-col items-center gap-0.5 min-w-[64px] py-1"
              >
                {tab.icon(isActive)}
                <span
                  className="text-[10px] font-medium tracking-wide uppercase"
                  style={{ color: isActive ? "#c9a84c" : "#8a8580" }}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
