import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  const gold = "#c9a84c"; // --t-gold-500 hardcoded — CSS vars don't resolve in ImageResponse
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
        <svg width="340" height="420" viewBox="0 0 280 340" fill="none">
          {/* Gravestone outline */}
          <path d="M20 340 L20 140 Q20 20 140 20 Q260 20 260 140 L260 340 Z" fill={gold} />
          {/* Inner cutout - precise alignment with BrandLogo */}
          <path d="M60 340 L60 140 Q60 60 140 60 Q220 60 220 140 L220 340 Z" stroke={bg} strokeWidth="22" strokeLinecap="round" />
          {/* Lens center - precise alignment with BrandLogo */}
          <circle cx="140" cy="160" r="32" stroke={bg} strokeWidth="22" />
          <circle cx="140" cy="160" r="12" fill={bg} />
        </svg>
      </div>
    ),
    { ...size }
  );
}
