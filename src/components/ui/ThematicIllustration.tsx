"use client";

import React from "react";

type IllustrationType = "urn" | "stone" | "lens" | "map";

interface ThematicIllustrationProps {
  type: IllustrationType;
  className?: string;
  size?: number;
}

export default function ThematicIllustration({
  type,
  className = "",
  size = 120,
}: ThematicIllustrationProps) {
  const color = "var(--t-gold-500)"; // Gold-500

  const illustrations: Record<IllustrationType, React.ReactNode> = {
    urn: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2h12v2H6zM8 4v2a4 4 0 0 0-4 4v2s0 2 2 2h8s2 0 2-2v-2a4 4 0 0 0-4-4V4M6 22h12M12 14v8" />
        <path d="M4 10h16" opacity="0.4" />
      </svg>
    ),
    stone: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 22h14a1 1 0 0 0 1-1V10a7 7 0 0 0-16 0v11a1 1 0 0 0 1 1z" />
        <path d="M12 7v6M9 10h6" opacity="0.6" />
        <path d="M5 16h14" opacity="0.3" />
      </svg>
    ),
    lens: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" opacity="0.5" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2" opacity="0.4" />
        <path d="M7.76 7.76l1.41 1.41M14.83 14.83l1.41 1.41" opacity="0.4" />
        <path d="M7.76 16.24l1.41-1.41M14.83 9.17l1.41-1.41" opacity="0.4" />
      </svg>
    ),
    map: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" />
        <path d="M9 3v15M15 6v15" opacity="0.4" />
        <circle cx="12" cy="11" r="2" fill={color} fillOpacity="0.2" />
        <path d="M12 13v1" opacity="0.6" />
      </svg>
    ),
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      {illustrations[type]}
    </div>
  );
}
