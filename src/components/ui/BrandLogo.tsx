"use client";

import React from "react";

interface BrandLogoProps {
  className?: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * The official GraveLens brand logo.
 * A stylized "lens" with four crosshair tick marks.
 * Designed to be religion-neutral and professional.
 */
export default function BrandLogo({
  className = "",
  size = 24,
  color = "#c9a84c", // Gold-500
  strokeWidth = 1.5,
}: BrandLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Horizontal Crosshairs */}
      <rect x="0" y="47" width="22" height="6" fill={color} rx="3" />
      <rect x="78" y="47" width="22" height="6" fill={color} rx="3" />
      
      {/* Vertical Crosshairs */}
      <rect x="47" y="0" width="6" height="22" fill={color} rx="3" />
      <rect x="47" y="78" width="6" height="22" fill={color} rx="3" />

      {/* Outer Lens Circle */}
      <circle
        cx="50"
        cy="50"
        r="32"
        stroke={color}
        strokeWidth={strokeWidth * 4}
      />
      
      {/* Center Dot */}
      <circle cx="50" cy="50" r="8" fill={color} />
    </svg>
  );
}
