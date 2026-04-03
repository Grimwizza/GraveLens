import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  const gold = "#c9a84c";
  const bg = "#1a1917";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
        }}
      >
        <svg width="280" height="340" viewBox="0 0 280 340" fill="none">
          {/* Gravestone outline */}
          <path d="M20 340 L20 140 Q20 20 140 20 Q260 20 260 140 L260 340 Z" fill={gold} />
          {/* Inner cutout to give it shape */}
          <path d="M60 340 L60 140 Q60 60 140 60 Q220 60 220 140 L220 340 Z" stroke={bg} strokeWidth="20" />
          {/* Lens/camera aperture in the center (Grave + Lens) */}
          <circle cx="140" cy="160" r="32" stroke={bg} strokeWidth="20" />
          <circle cx="140" cy="160" r="12" fill={bg} />
        </svg>
      </div>
    ),
    { ...size }
  );
}
