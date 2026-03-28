"use client";

interface BrandLogoProps {
  className?: string;
  size?: number;
  color?: string;
}

/**
 * The official GraveLens brand logo.
 * A camera autofocus box — four corner brackets framing a focal point,
 * the universal symbol of a digital camera locking onto its subject.
 */
export default function BrandLogo({
  className = "",
  size = 24,
  color = "#c9a84c",
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
      {/* Top-left corner */}
      <path d="M18 38 L18 18 L38 18" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Top-right corner */}
      <path d="M82 38 L82 18 L62 18" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Bottom-left corner */}
      <path d="M18 62 L18 82 L38 82" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Bottom-right corner */}
      <path d="M82 62 L82 82 L62 82" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Center focus point */}
      <circle cx="50" cy="50" r="3.5" fill={color} opacity="0.8" />
    </svg>
  );
}
