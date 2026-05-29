"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import BrandLogo from "@/components/ui/BrandLogo";
import ProfileBadge from "@/components/auth/ProfileBadge";
import { getQueueCount } from "@/lib/storage";
import { QUEUE_CHANGED_EVENT } from "@/lib/queue";

const navItems = [
  {
    href: "/",
    label: "Home",
    matchFn: (p: string) => p === "/" || p.startsWith("/result"),
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={active ? "var(--t-gold-500)" : "var(--t-stone-400)"}
        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    href: "/archive",
    label: "Archive",
    matchFn: (p: string) => p === "/archive" || p.startsWith("/archive/"),
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={active ? "var(--t-gold-500)" : "var(--t-stone-400)"}
        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z" />
        <path d="M3 12h18M3 18h18M7 12v6M12 12v6M17 12v6" />
      </svg>
    ),
  },
  {
    href: "/map",
    label: "Map",
    matchFn: (p: string) => p === "/map" || p.startsWith("/map/"),
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={active ? "var(--t-gold-500)" : "var(--t-stone-400)"}
        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    ),
  },
  {
    href: "/explorer",
    label: "Explorer",
    matchFn: (p: string) => p === "/explorer" || p.startsWith("/explorer/"),
    icon: (active: boolean) => (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={active ? "var(--t-gold-500)" : "var(--t-stone-400)"}
        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M8 8H4l2 8h12l2-8h-4" />
        <path d="M9 16l1 4h4l1-4" />
      </svg>
    ),
  },
];

export default function DesktopNav() {
  const pathname = usePathname();
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    getQueueCount().then(setQueueCount).catch(() => {});
    const onQueueChanged = () => getQueueCount().then(setQueueCount).catch(() => {});
    window.addEventListener(QUEUE_CHANGED_EVENT, onQueueChanged);
    return () => window.removeEventListener(QUEUE_CHANGED_EVENT, onQueueChanged);
  }, []);

  const isScanActive = pathname === "/" || pathname.startsWith("/result");

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 w-56 z-40 flex flex-col bg-stone-950/80 backdrop-blur-2xl border-r border-stone-800/50"
      style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))", paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
    >
      {/* Brand */}
      <div className="px-5 pb-5 border-b border-stone-800/50">
        <div className="flex items-center gap-2">
          <BrandLogo size={20} color="var(--t-gold-500)" />
          <span className="font-serif font-semibold text-[1.25rem] leading-none">
            <span className="text-stone-50">Grave</span>
            <span style={{ color: "var(--t-gold-500)" }}>Lens</span>
          </span>
        </div>
        <span className="italic text-white text-[0.6rem] leading-none opacity-50 mt-1 ml-7 block">
          By <a href="https://www.lowhigh.ai" target="_blank" rel="noopener noreferrer" className="hover:opacity-80">LowHigh</a>
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-0.5 px-3 pt-4 flex-1">
        {navItems.map((item) => {
          const active = item.matchFn(pathname);
          const showBadge = item.href === "/" && queueCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
              style={{
                background: active ? "rgba(201,168,76,0.1)" : "transparent",
                color: active ? "var(--t-gold-500)" : "var(--t-stone-400)",
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {item.icon(active)}
              <span className="text-sm font-medium">{item.label}</span>
              {showBadge && (
                <span
                  className="ml-auto min-w-[18px] h-[18px] rounded-full text-[0.7rem] font-bold flex items-center justify-center px-1"
                  style={{ background: "var(--t-gold-500)", color: "var(--t-stone-900)" }}
                >
                  {queueCount > 9 ? "9+" : queueCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Upload button */}
      <div className="px-3 pb-4">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 w-full h-10 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
          style={{
            background: isScanActive
              ? "linear-gradient(135deg, #eadd9a 0%, var(--t-gold-500) 50%, #9e7f33 100%)"
              : "linear-gradient(135deg, #c9a84c 0%, #a07830 100%)",
            color: "var(--t-stone-900)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Upload a Photo
        </Link>
      </div>

      {/* Profile */}
      <div className="px-4 pt-3 border-t border-stone-800/50">
        <ProfileBadge />
      </div>
    </aside>
  );
}
