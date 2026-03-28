import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Camera autofocus box logo — built with divs for reliable Satori rendering.
export default function Icon() {
  const gold = "#c9a84c";
  const box = 340;   // inner box size
  const arm = 86;    // corner bracket arm length
  const bar = 20;    // bar thickness
  const r = 10;      // border-radius on bar ends

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a1917",
        }}
      >
        <div style={{ position: "relative", width: box, height: box, display: "flex" }}>
          {/* Top-left — horizontal */}
          <div style={{ position: "absolute", top: 0, left: 0, width: arm, height: bar, background: gold, borderRadius: r }} />
          {/* Top-left — vertical */}
          <div style={{ position: "absolute", top: 0, left: 0, width: bar, height: arm, background: gold, borderRadius: r }} />

          {/* Top-right — horizontal */}
          <div style={{ position: "absolute", top: 0, right: 0, width: arm, height: bar, background: gold, borderRadius: r }} />
          {/* Top-right — vertical */}
          <div style={{ position: "absolute", top: 0, right: 0, width: bar, height: arm, background: gold, borderRadius: r }} />

          {/* Bottom-left — horizontal */}
          <div style={{ position: "absolute", bottom: 0, left: 0, width: arm, height: bar, background: gold, borderRadius: r }} />
          {/* Bottom-left — vertical */}
          <div style={{ position: "absolute", bottom: 0, left: 0, width: bar, height: arm, background: gold, borderRadius: r }} />

          {/* Bottom-right — horizontal */}
          <div style={{ position: "absolute", bottom: 0, right: 0, width: arm, height: bar, background: gold, borderRadius: r }} />
          {/* Bottom-right — vertical */}
          <div style={{ position: "absolute", bottom: 0, right: 0, width: bar, height: arm, background: gold, borderRadius: r }} />

          {/* Center focus dot */}
          <div style={{ position: "absolute", top: (box - 22) / 2, left: (box - 22) / 2, width: 22, height: 22, borderRadius: "50%", background: gold, opacity: 0.85 }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
