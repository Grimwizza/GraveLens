import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/proxyClient";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createClient(request, response);

  // Silently refreshes the session cookie on every request so the user
  // stays logged in across page navigations and PWA cold starts.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|sw\\.js|manifest\\.webmanifest|.*\\.png$).*)",
  ],
};
