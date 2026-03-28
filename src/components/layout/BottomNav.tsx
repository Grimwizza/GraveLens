"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { recordActiveDay } from "@/lib/achievements";
import { getQueueCount } from "@/lib/storage";
import { startQueueProcessor, QUEUE_CHANGED_EVENT } from "@/lib/queue";

const leftTabs = [
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
];

const rightTabs = [
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
  const router = useRouter();
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    recordActiveDay();

    getQueueCount().then(setQueueCount).catch(() => {});

    const onQueueChanged = () => {
      getQueueCount().then(setQueueCount).catch(() => {});
    };
    window.addEventListener(QUEUE_CHANGED_EVENT, onQueueChanged);

    const cleanup = startQueueProcessor();

    return () => {
      window.removeEventListener(QUEUE_CHANGED_EVENT, onQueueChanged);
      cleanup();
    };
  }, []);

  const handleCameraClick = () => {
    if (pathname === "/") {
      // Capture page is already mounted — dispatch event directly
      window.dispatchEvent(new Event("gravelens:open-camera"));
    } else {
      // Navigate to capture page and flag to auto-open camera on mount
      sessionStorage.setItem("openCamera", "1");
      router.push("/");
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      {/* Camera FAB — protrudes above the nav bar */}
      <div className="absolute left-1/2 -translate-x-1/2" style={{ top: "-34px" }}>
        <button
          onClick={handleCameraClick}
          className="w-[68px] h-[68px] rounded-full flex items-center justify-center transition-transform active:scale-90"
          style={{
            background: "linear-gradient(145deg, #d4b76a, #c9a84c, #a8873a)",
            boxShadow: "0 4px 20px rgba(201, 168, 76, 0.5), 0 2px 8px rgba(0,0,0,0.6)",
          }}
          aria-label="Take a photo"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#1a1917" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </button>
      </div>

      {/* Nav bar */}
      <div className="glass border-t border-stone-700/50 pb-safe shadow-[0_-8px_24px_rgba(0,0,0,0.4)]">
        <div className="flex items-center h-16 max-w-lg mx-auto">
          {/* Left tabs */}
          <div className="flex-1 flex items-center justify-around">
            {leftTabs.map((tab) => {
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

          {/* Center spacer for FAB */}
          <div className="w-[88px] flex-shrink-0" />

          {/* Right tabs */}
          <div className="flex-1 flex items-center justify-around">
            {rightTabs.map((tab) => {
              const isActive =
                pathname === tab.href || pathname.startsWith(tab.href + "/");

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="relative flex flex-col items-center gap-1 min-w-[72px] py-1 transition-all active:scale-95"
                >
                  {tab.icon(isActive)}
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
        </div>
      </div>
    </nav>
  );
}

// Exporting the event name so CapturePage can listen for it
export const OPEN_CAMERA_EVENT = "gravelens:open-camera";
