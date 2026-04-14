import React from "react";

interface BrandLogoProps {
  className?: string;
  size?: number;
  color?: string;
}

/**
 * The official GraveLens brand logo — an exact replica of the favicon from icon.tsx.
 * Represents a gravestone and camera lens in one.
 */
export default function BrandLogo({
  className = "",
  size = 24,
  color = "var(--t-gold-500)", // Matching icon.tsx gold
}: BrandLogoProps) {
  // Provide a safe, static, colon-free id so it doesn't fail on iOS Safari masks
  const maskId = "brand-logo-mask-v1";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 280 340"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <mask id={maskId}>
          {/* Base shape visible */}
          <rect x="0" y="0" width="280" height="340" fill="white" />
          
          {/* Exact cutout paths from icon.tsx */}
          <path 
            d="M60 340 L60 140 Q60 60 140 60 Q220 60 220 140 L220 340 Z" 
            stroke="black" 
            strokeWidth="20" 
            fill="none" 
          />
          <circle cx="140" cy="160" r="32" stroke="black" strokeWidth="20" fill="none" />
          <circle cx="140" cy="160" r="12" fill="black" />
        </mask>
      </defs>

      <path
        d="M20 340 L20 140 Q20 20 140 20 Q260 20 260 140 L260 340 Z"
        fill={color}
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}
