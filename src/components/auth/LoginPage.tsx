"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BrandLogo from "@/components/ui/BrandLogo";
import { createClient } from "@/lib/supabase/browser";
import { syncLocalToCloud, hasEverSynced } from "@/lib/cloudSync";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const authError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(authError === "auth_failed" ? "Sign-in failed. Please try again." : "");
  const [success, setSuccess] = useState("");

  // If already logged in, redirect away
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace(next);
    });
  }, [next, router]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const supabase = createClient();

    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message); return; }
        if (data.user) await runPostLoginSync(supabase, data.user.id);
        router.replace(next);
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}` },
        });
        if (error) { setError(error.message); return; }
        setSuccess("Check your email for a confirmation link.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
    // Page navigates away on success — no need to reset loading
  };

  return (
    <div
      className="flex flex-col h-dvh bg-stone-900"
      style={{ paddingTop: "max(2.5rem, env(safe-area-inset-top))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      {/* Back button */}
      <div className="px-5 mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-stone-500 active:text-stone-300 text-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-sm mx-auto w-full">
        {/* Brand */}
        <div className="flex items-center gap-2.5 mb-8">
          <BrandLogo size={28} color="#c9a84c" />
          <span className="font-serif text-2xl font-semibold tracking-wide text-stone-50">
            GraveLens
          </span>
        </div>

        <h1 className="font-serif text-xl text-stone-100 font-semibold text-center mb-1">
          {mode === "signin" ? "Welcome back" : "Create an account"}
        </h1>
        <p className="text-stone-400 text-sm text-center mb-8">
          {mode === "signin"
            ? "Sign in to sync your archive across devices."
            : "Save and access your archive from any device."}
        </p>

        {/* Error / success */}
        {error && (
          <div className="w-full mb-4 px-4 py-3 rounded-xl text-sm text-red-300 bg-red-900/20 border border-red-800/40">
            {error}
          </div>
        )}
        {success && (
          <div className="w-full mb-4 px-4 py-3 rounded-xl text-sm text-green-300 bg-green-900/20 border border-green-800/40">
            {success}
          </div>
        )}

        {/* Email/password form */}
        <form onSubmit={handleEmailAuth} className="w-full flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            autoComplete="email"
            className="w-full h-12 rounded-xl bg-stone-800 border border-stone-700 px-4 text-stone-100 text-sm placeholder-stone-500 focus:outline-none focus:border-stone-500"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="w-full h-12 rounded-xl bg-stone-800 border border-stone-700 px-4 text-stone-100 text-sm placeholder-stone-500 focus:outline-none focus:border-stone-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl font-semibold text-stone-900 text-sm transition-all active:scale-[0.97] disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 w-full my-5">
          <div className="flex-1 h-px bg-stone-700" />
          <span className="text-stone-600 text-xs">or</span>
          <div className="flex-1 h-px bg-stone-700" />
        </div>

        {/* Google OAuth */}
        <button
          onClick={handleGoogle}
          disabled={googleLoading}
          className="w-full h-12 rounded-xl flex items-center justify-center gap-3 border border-stone-700 bg-stone-800 text-stone-200 text-sm font-medium transition-all active:scale-[0.97] disabled:opacity-60"
        >
          {googleLoading ? (
            <div className="w-4 h-4 border-2 border-stone-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          )}
          Continue with Google
        </button>

        {/* Mode toggle */}
        <p className="text-stone-500 text-sm mt-6">
          {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setSuccess(""); }}
            className="text-stone-300 underline"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>

      {/* Skip */}
      <div className="px-6 text-center">
        <button
          onClick={() => router.back()}
          className="text-stone-600 text-sm"
        >
          Skip for now — stay offline
        </button>
      </div>
    </div>
  );
}

async function runPostLoginSync(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  if (hasEverSynced()) return;
  // Fire and forget — don't block the redirect
  syncLocalToCloud(supabase, userId).catch((err) =>
    console.warn("[Sync] Post-login migration failed:", err)
  );
}
