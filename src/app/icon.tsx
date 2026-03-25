import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
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
        {/* Crosshair lens: vertical bar top */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 18,
              height: 88,
              background: "#c9a84c",
              borderRadius: 9,
            }}
          />
          {/* Middle row */}
          <div
            style={{ display: "flex", alignItems: "center" }}
          >
            {/* Left bar */}
            <div
              style={{
                height: 18,
                width: 88,
                background: "#c9a84c",
                borderRadius: 9,
              }}
            />
            {/* Circle ring */}
            <div
              style={{
                width: 220,
                height: 220,
                borderRadius: "50%",
                border: "18px solid #c9a84c",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Center dot */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "#c9a84c",
                }}
              />
            </div>
            {/* Right bar */}
            <div
              style={{
                height: 18,
                width: 88,
                background: "#c9a84c",
                borderRadius: 9,
              }}
            />
          </div>
          {/* Bottom bar */}
          <div
            style={{
              width: 18,
              height: 88,
              background: "#c9a84c",
              borderRadius: 9,
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}
