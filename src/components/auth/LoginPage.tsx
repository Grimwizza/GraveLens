"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BrandLogo from "@/components/ui/BrandLogo";
import { createClient } from "@/lib/supabase/browser";
import { syncLocalToCloud, hasEverSynced } from "@/lib/cloudSync";

type Mode = "signin" | "signup" | "verify";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const authError = searchParams.get("error");

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    authError === "auth_failed" ? "Sign-in failed. Please try again." : ""
  );
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Redirect away if already signed in
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace(next);
    });
  }, [next, router]);

  // Focus OTP input when verify screen appears
  useEffect(() => {
    if (mode === "verify") {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    }
  }, [mode]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message); return; }
        if (data.user) await runPostLoginSync(supabase, data.user.id);
        router.replace(next);
      } else {
        // Sign up — Supabase sends a confirmation email containing both a link
        // and a 6-digit code ({{ .Token }} in the email template). We then show
        // the in-app OTP screen so the user never has to leave the PWA.
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}`,
          },
        });
        if (error) { setError(error.message); return; }
        setMode("verify");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = otpCode.trim();
    if (token.length !== 6) { setError("Enter the 6-digit code from your email."); return; }

    setLoading(true);
    setError("");
    const supabase = createClient();
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (error) { setError(error.message); return; }
      if (data.user) await runPostLoginSync(supabase, data.user.id);
      router.replace(next);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    const supabase = createClient();
    await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      },
    });
    setOtpCode("");
    otpInputRef.current?.focus();
  };

  // ── Verify screen ─────────────────────────────────────────────────────────
  if (mode === "verify") {
    return (
      <div
        className="flex flex-col h-dvh bg-stone-900"
        style={{
          paddingTop: "max(2.5rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="px-5 mb-6">
          <button
            onClick={() => { setMode("signup"); setOtpCode(""); setError(""); }}
            className="flex items-center gap-1.5 text-stone-500 active:text-stone-300 text-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-sm mx-auto w-full">
          {/* Email icon */}
          <div className="w-16 h-16 rounded-2xl bg-stone-800 border border-stone-700 flex items-center justify-center mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>

          <h1 className="font-serif text-xl text-stone-100 font-semibold text-center mb-2">
            Check your email
          </h1>
          <p className="text-stone-400 text-sm text-center mb-8 leading-relaxed">
            We sent a 6-digit code to{" "}
            <span className="text-stone-200">{email}</span>.
            Enter it below to verify your account.
          </p>

          {error && (
            <div className="w-full mb-4 px-4 py-3 rounded-xl text-sm text-red-300 bg-red-900/20 border border-red-800/40">
              {error}
            </div>
          )}

          <form onSubmit={handleVerifyOtp} className="w-full flex flex-col gap-3">
            <input
              ref={otpInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-full h-14 rounded-xl bg-stone-800 border border-stone-700 px-4 text-center text-stone-100 text-2xl tracking-[0.5em] font-mono placeholder-stone-600 focus:outline-none focus:border-stone-500"
            />
            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full h-12 rounded-xl font-semibold text-stone-900 text-sm transition-all active:scale-[0.97] disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #c9a84c, #d4b76a)" }}
            >
              {loading ? "Verifying…" : "Verify Email"}
            </button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-stone-600 text-xs">
              Can't find it? Check your <span className="text-stone-400">spam or junk</span> folder.
            </p>
            <p className="text-stone-600 text-sm">
              Didn't receive it?{" "}
              <button onClick={handleResend} className="text-stone-400 underline">
                Resend code
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Sign in / Sign up screen ───────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-dvh bg-stone-900"
      style={{
        paddingTop: "max(2.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
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

        {error && (
          <div className="w-full mb-4 px-4 py-3 rounded-xl text-sm text-red-300 bg-red-900/20 border border-red-800/40">
            {error}
          </div>
        )}

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

        <p className="text-stone-500 text-sm mt-6">
          {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
            className="text-stone-300 underline"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>

      <div className="px-6 text-center">
        <button onClick={() => router.back()} className="text-stone-600 text-sm">
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
  syncLocalToCloud(supabase, userId).catch((err) =>
    console.warn("[Sync] Post-login migration failed:", err)
  );
}
