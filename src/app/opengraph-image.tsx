import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Reusable AF-box corner bracket set (div-based for reliable Satori rendering).
// `s` = outer box size, `arm` = bracket arm length, `bar` = bar thickness.
function AfBox({ s, arm, bar }: { s: number; arm: number; bar: number }) {
  const gold = "#c9a84c";
  const r = Math.round(bar / 2);
  const dot = Math.round(bar * 1.5);
  return (
    <div style={{ position: "relative", width: s, height: s, display: "flex" }}>
      {/* Top-left */}
      <div style={{ position: "absolute", top: 0, left: 0, width: arm, height: bar, background: gold, borderRadius: r }} />
      <div style={{ position: "absolute", top: 0, left: 0, width: bar, height: arm, background: gold, borderRadius: r }} />
      {/* Top-right */}
      <div style={{ position: "absolute", top: 0, right: 0, width: arm, height: bar, background: gold, borderRadius: r }} />
      <div style={{ position: "absolute", top: 0, right: 0, width: bar, height: arm, background: gold, borderRadius: r }} />
      {/* Bottom-left */}
      <div style={{ position: "absolute", bottom: 0, left: 0, width: arm, height: bar, background: gold, borderRadius: r }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, width: bar, height: arm, background: gold, borderRadius: r }} />
      {/* Bottom-right */}
      <div style={{ position: "absolute", bottom: 0, right: 0, width: arm, height: bar, background: gold, borderRadius: r }} />
      <div style={{ position: "absolute", bottom: 0, right: 0, width: bar, height: arm, background: gold, borderRadius: r }} />
      {/* Center focus dot */}
      <div style={{
        position: "absolute",
        top: Math.round((s - dot) / 2),
        left: Math.round((s - dot) / 2),
        width: dot,
        height: dot,
        borderRadius: "50%",
        background: gold,
        opacity: 0.8,
      }} />
    </div>
  );
}

export default function OpenGraphImage() {
  const gold = "#c9a84c";

  // Viewfinder dimensions
  const vf = 284; // container px
  const scale = vf / 256; // maps SVG viewBox coords to container px

  // Headstone occupies viewBox y=96..190, x=96..160; center ≈ (128, 143)
  const hsX = Math.round(128 * scale); // 142
  const hsY = Math.round(143 * scale); // 158
  const afSize = 52;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #222020 0%, #1a1917 45%, #111010 100%)",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        {/* ── Brand row ───────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 44 }}>
          <AfBox s={48} arm={13} bar={4} />
          <div style={{ display: "flex" }}>
            <span style={{ fontSize: 74, fontWeight: 700, color: "#f5f2ed", letterSpacing: 1, lineHeight: 1 }}>Grave</span>
            <span style={{ fontSize: 74, fontWeight: 700, color: gold,     letterSpacing: 1, lineHeight: 1 }}>Lens</span>
          </div>
        </div>

        {/* ── Viewfinder ──────────────────────────────────────────────── */}
        <div style={{ position: "relative", width: vf, height: vf, display: "flex", marginBottom: 40 }}>

          {/* Gold corner brackets */}
          {/* Top-left */}
          <div style={{ position: "absolute", top: 0, left: 0, width: 60, height: 3, background: gold, borderRadius: 2, opacity: 0.85 }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: 60, background: gold, borderRadius: 2, opacity: 0.85 }} />
          {/* Top-right */}
          <div style={{ position: "absolute", top: 0, right: 0, width: 60, height: 3, background: gold, borderRadius: 2, opacity: 0.85 }} />
          <div style={{ position: "absolute", top: 0, right: 0, width: 3, height: 60, background: gold, borderRadius: 2, opacity: 0.85 }} />
          {/* Bottom-left */}
          <div style={{ position: "absolute", bottom: 0, left: 0, width: 60, height: 3, background: gold, borderRadius: 2, opacity: 0.85 }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, width: 3, height: 60, background: gold, borderRadius: 2, opacity: 0.85 }} />
          {/* Bottom-right */}
          <div style={{ position: "absolute", bottom: 0, right: 0, width: 60, height: 3, background: gold, borderRadius: 2, opacity: 0.85 }} />
          <div style={{ position: "absolute", bottom: 0, right: 0, width: 3, height: 60, background: gold, borderRadius: 2, opacity: 0.85 }} />

          {/* Headstone silhouette — arch body */}
          <div style={{
            position: "absolute",
            left: Math.round(96 * scale),
            top: Math.round(110 * scale),
            width: Math.round(64 * scale),
            height: Math.round(80 * scale),
            background: "#2e2b28",
            borderTopLeftRadius: Math.round(32 * scale),
            borderTopRightRadius: Math.round(32 * scale),
          }} />

          {/* AF focus box centered on headstone */}
          <div style={{
            position: "absolute",
            top: hsY - Math.round(afSize / 2),
            left: hsX - Math.round(afSize / 2),
            display: "flex",
          }}>
            <AfBox s={afSize} arm={14} bar={4} />
          </div>

          {/* "POINT & SCAN" label */}
          <div style={{
            position: "absolute",
            bottom: 8,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
          }}>
            <span style={{
              fontSize: 11,
              color: "#4a4642",
              fontFamily: "Arial, sans-serif",
              letterSpacing: 5,
              textTransform: "uppercase",
              fontWeight: 700,
            }}>
              Point &amp; Scan
            </span>
          </div>
        </div>

        {/* ── Headline ────────────────────────────────────────────────── */}
        <div style={{
          fontSize: 30,
          fontWeight: 600,
          color: "#d0cbc5",
          textAlign: "center",
          maxWidth: 700,
          lineHeight: 1.35,
          marginBottom: 14,
        }}>
          Bring the story behind every stone into focus.
        </div>

        {/* ── Tagline ─────────────────────────────────────────────────── */}
        <div style={{
          fontSize: 21,
          color: "#5c5854",
          textAlign: "center",
          maxWidth: 680,
          lineHeight: 1.5,
          fontFamily: "Arial, sans-serif",
        }}>
          Photograph any headstone and experience history like never before.
        </div>
      </div>
    ),
    { ...size }
  );
}
