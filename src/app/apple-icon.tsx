import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          borderRadius: "40px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{ width: 7, height: 32, background: "#c9a84c", borderRadius: 4 }}
          />
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{ height: 7, width: 32, background: "#c9a84c", borderRadius: 4 }}
            />
            <div
              style={{
                width: 78,
                height: 78,
                borderRadius: "50%",
                border: "7px solid #c9a84c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "#c9a84c",
                }}
              />
            </div>
            <div
              style={{ height: 7, width: 32, background: "#c9a84c", borderRadius: 4 }}
            />
          </div>
          <div
            style={{ width: 7, height: 32, background: "#c9a84c", borderRadius: 4 }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
