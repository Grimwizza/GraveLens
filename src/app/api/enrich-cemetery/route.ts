import { NextRequest, NextResponse } from "next/server";
import { enrichCemetery } from "@/lib/apis/cemetery";

export async function POST(req: NextRequest) {
  try {
    const { name, lat, lng, city, state } = await req.json();
    if (!name || typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "name, lat, lng required" }, { status: 400 });
    }
    const result = await enrichCemetery(name, lat, lng, city, state);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[enrich-cemetery]", err);
    return NextResponse.json({ error: "enrichment failed" }, { status: 500 });
  }
}
