"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { recordActiveDay } from "@/lib/achievements";
import { getQueueCount } from "@/lib/storage";
import { startQueueProcessor, QUEUE_CHANGED_EVENT } from "@/lib/queue";

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
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    recordActiveDay();

    // Load initial queue count
    getQueueCount().then(setQueueCount).catch(() => {});

    // Update count when queue changes
    const onQueueChanged = () => {
      getQueueCount().then(setQueueCount).catch(() => {});
    };
    window.addEventListener(QUEUE_CHANGED_EVENT, onQueueChanged);

    // Start the background processor
    const cleanup = startQueueProcessor();

    return () => {
      window.removeEventListener(QUEUE_CHANGED_EVENT, onQueueChanged);
      cleanup();
    };
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-stone-700/50 pb-safe shadow-[0_-8px_24px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-4">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/" || pathname.startsWith("/result")
              : pathname === tab.href || pathname.startsWith(tab.href + "/");

          const showBadge = tab.href === "/" && queueCount > 0;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative flex flex-col items-center gap-1 min-w-[72px] py-1 transition-all active:scale-95"
            >
              {tab.icon(isActive)}
              {showBadge && (
                <span
                  className="absolute -top-0.5 right-3 min-w-[16px] h-4 rounded-full text-[10px] font-bold flex items-center justify-center px-1"
                  style={{ background: "#c9a84c", color: "#1a1917" }}
                >
                  {queueCount > 9 ? "9+" : queueCount}
                </span>
              )}
              <span
                className="text-[11px] font-semibold tracking-wide uppercase"
                style={{ color: isActive ? "#c9a84c" : "#8a8580" }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
