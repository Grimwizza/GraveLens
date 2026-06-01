import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Validates the Supabase session from the incoming request cookies.
 * Returns { userId } on success, or a 401 NextResponse on failure.
 *
 * Usage in a route handler:
 *   const auth = await requireAuth();
 *   if (auth instanceof NextResponse) return auth;
 */
export async function requireAuth(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { userId: user.id };
}
