"use client";

// OAuth callback page — handles the redirect from Google via Supabase.
//
// Two flows arrive here:
//   1. Popup flow (iOS PWA):  the OAuth opened in a new Safari tab.
//      We exchange the code, try to close this tab, and show a "Return to app"
//      screen as fallback in case window.close() is blocked.
//   2. Redirect flow (fallback): the full window navigated here.
//      We exchange the code and navigate to the app normally.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BrandLogo from "@/components/ui/BrandLogo";
import { createClient } from "@/lib/supabase/browser";

type Status = "loading" | "success" | "error";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const tokenHash = params.get("token_hash");
    const type = params.get("type") ?? "signup";
    const next = params.get("next") ?? "/";
    const oauthError = params.get("error");

    if (oauthError) {
      setErrorMsg(oauthError.replace(/_/g, " "));
      setStatus("error");
      return;
    }

    if (!code && !tokenHash) {
      setErrorMsg("No authentication code received.");
      setStatus("error");
      return;
    }

    const supabase = createClient();

    // token_hash is used by email confirmation links — it requires no stored
    // PKCE verifier so it works when the link is opened in any browser context.
    // code is used by the OAuth/PKCE popup flow.
    const authPromise = tokenHash
      ? supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "signup" | "magiclink" | "recovery" | "email_change" | "email" })
      : supabase.auth.exchangeCodeForSession(code!);

    authPromise.then(({ error }) => {
      if (error) {
        setErrorMsg(error.message);
        setStatus("error");
        return;
      }

      setStatus("success");

      // Popup flow: try to close this tab so the user lands back in the PWA.
      try {
        window.close();
      } catch {
        // Blocked — fall through to the redirect/button below.
      }

      // Redirect flow (or if window.close() was blocked): navigate to the app.
      setTimeout(() => {
        router.replace(next);
      }, 400);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="flex flex-col items-center justify-center h-full bg-stone-900 px-6 text-center"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-center gap-2.5 mb-10">
        <BrandLogo size={28} color="#c9a84c" />
        <span className="font-serif text-2xl font-semibold tracking-wide">
          <span className="text-stone-50">Grave</span><span style={{ color: "#c9a84c" }}>Lens</span>
        </span>
      </div>

      {status === "loading" && (
        <>
          <div className="w-5 h-5 border-2 border-stone-600 border-t-stone-200 rounded-full animate-spin mb-4" />
          <p className="text-stone-400 text-sm">Signing you in…</p>
        </>
      )}

      {status === "success" && (
        <>
          <p className="text-stone-200 text-base font-medium mb-1">Signed in</p>
          <p className="text-stone-500 text-sm mb-8">Taking you back to the app…</p>
          {/* Visible button in case auto-redirect or window.close() both fail */}
          <a
            href="/"
            className="h-12 px-8 rounded-xl font-semibold text-stone-900 text-sm flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
          >
            Open GraveLens
          </a>
        </>
      )}

      {status === "error" && (
        <>
          <p className="text-red-400 text-sm mb-6 capitalize">{errorMsg || "Sign-in failed."}</p>
          <a
            href="/login"
            className="h-12 px-8 rounded-xl border border-stone-700 text-stone-300 text-sm flex items-center justify-center"
          >
            Try Again
          </a>
        </>
      )}
    </div>
  );
}
