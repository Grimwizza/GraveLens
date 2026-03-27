import { NextResponse } from "next/server";

// Returns the build timestamp baked in at deploy time.
// The running client compares its own baked-in NEXT_PUBLIC_BUILD_TIME against
// this response to detect when a newer version has been deployed.
export async function GET() {
  return NextResponse.json(
    { buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? "dev" },
    {
      headers: {
        // Never cache this — always fetch fresh from the server
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
