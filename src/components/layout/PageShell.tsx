"use client";

import React, { ReactNode } from "react";
import BottomNav from "@/components/layout/BottomNav";
import ProfileBadge from "@/components/auth/ProfileBadge";
import BrandLogo from "@/components/ui/BrandLogo";

interface PageShellProps {
  children: ReactNode;
  /** Page title to display in the header (if not showing logo) */
  title?: string;
  /** Icon component to display next to the title */
  icon?: ReactNode;
  /** Whether to show the GraveLens logo instead of title/icon */
  showLogo?: boolean;
  /** Actions rendered on the right side of the main header row (next to ProfileBadge) */
  headerActions?: ReactNode;
  /** Actions rendered inline next to the GraveLens logo */
  headerTitleActions?: ReactNode;
  /** Optional bottom row for the header (e.g., segment controls, view modes) */
  headerBottomRow?: ReactNode;
  /** Optional panels attached below the header (e.g., search/filter open states) */
  headerPanels?: ReactNode;
  /** Disable scrolling on the main container (useful for maps) */
  noScroll?: boolean;
  /** Override the standard pb-44 padding if you need custom bottom clearance */
  customMainClasses?: string;
  /** Add absolute-positioned components to the wrapper scope (e.g. Map Legends) */
  absoluteOverlays?: ReactNode;
  /** Background class for the shell wrapper (defaults to bg-stone-900) */
  backgroundClass?: string;
}

export default function PageShell({
  children,
  title,
  icon,
  showLogo = false,
  headerActions,
  headerTitleActions,
  headerBottomRow,
  headerPanels,
  noScroll = false,
  customMainClasses,
  absoluteOverlays,
  backgroundClass = "bg-stone-900",
}: PageShellProps) {
  return (
    <div className={`flex flex-col h-full ${backgroundClass} overflow-hidden relative w-full`}>
      {/* Header */}
      <header
        className="flex-shrink-0 z-30 bg-[#121110]/80 backdrop-blur-2xl border-b border-stone-800/50 shadow-sm"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex flex-col gap-3 px-4 pb-3 pt-1">
          {/* Top Row: Brand & Core Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                {showLogo ? (
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <BrandLogo size={22} color="#c9a84c" />
                      <span className="font-serif font-semibold tracking-wide text-[1.5rem] leading-none">
                        <span className="text-stone-50">Grave</span><span style={{ color: "#c9a84c" }}>Lens</span>
                      </span>
                    </div>
                    <span className="italic text-white text-[0.65rem] leading-none opacity-60 mt-1 ml-7">
                      By <a href="https://www.lowhigh.ai" target="_blank" rel="noopener noreferrer" className="hover:text-gold-400">LowHigh</a>
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 py-1">
                    {icon && <div className="text-gold-400 shrink-0">{icon}</div>}
                    <h1 className="font-serif font-bold text-xl tracking-tight text-stone-50">
                      {title}
                    </h1>
                  </div>
                )}
              </div>
              {headerTitleActions}
            </div>

            <div className="flex items-center gap-3">
              {headerActions}
              <ProfileBadge />
            </div>
          </div>

          {/* Bottom Row: Tab Segments & View Modes */}
          {headerBottomRow && (
            <div className="flex items-center justify-between">
              {headerBottomRow}
            </div>
          )}
        </div>

        {/* Floating/Expanding Panels (Search, Filter, Map settings) */}
        {headerPanels}
      </header>

      {/* Main Content */}
      <main
        className={`flex-1 flex flex-col ${
          noScroll ? "overflow-hidden" : "scroll-container overflow-y-auto overflow-x-hidden"
        } ${customMainClasses !== undefined ? customMainClasses : "pb-44"}`}
        style={{ scrollbarWidth: "none" }}
      >
        {children}
      </main>

      {absoluteOverlays}

      {/* Bottom Navigation */}
      <div className="absolute bottom-0 left-0 right-0 z-[1001] pointer-events-none">
        <div className="pointer-events-auto">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
