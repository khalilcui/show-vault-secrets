import { createFileRoute, Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Shield, Mail, KeyRound, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  checkEmailExists,
  requestSignupOtp,
  verifySignupOtp,
} from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in or sign up — SecureVault" },
      { name: "description", content: "Create your SecureVault account with email verification or log in to send encrypted files and messages." },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
});

type Mode = "login" | "signup";
type Stage =
  | { name: "email"; mode: Mode }
  | { name: "login"; email: string }
  | { name: "signup"; email: string }
  | { name: "verify"; email: string; password: string; expiresAt: string };

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { next } = useSearch({ from: "/auth" });
  const [stage, setStage] = useState<Stage>({ name: "email", mode: "login" });
  const [busy, setBusy] = useState(false);

  // already signed in?
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: (next || "/send") as string });
    });
  }, [navigate, next]);

  const check = useServerFn(checkEmailExists);
  const reqOtp = useServerFn(requestSignupOtp);
  const verifyOtp = useServerFn(verifySignupOtp);

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (stage.name !== "email") return;
    const email = String(new FormData(e.currentTarget).get("email") ?? "")
      .trim()
      .toLowerCase();
    if (!email) return;
    setBusy(true);
    try {
      const { exists } = await check({ data: { email } });
      if (stage.mode === "login") {
        if (!exists) {
          toast.error("No account found for this email. Please sign up first.");
          setStage({ name: "email", mode: "signup" });
          return;
        }
        setStage({ name: "login", email });
      } else {
        if (exists) {
          toast.error("This email is already registered. Please log in.");
          setStage({ name: "email", mode: "login" });
          return;
        }
        setStage({ name: "signup", email });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check email");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (stage.name !== "login") return;
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: stage.email, password });
      if (error) throw error;
      toast.success("Welcome back!");
      router.invalidate();
      navigate({ to: (next || "/send") as string });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (stage.name !== "signup") return;
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    const displayName = String(fd.get("displayName") ?? "").trim();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords don't match");
    setBusy(true);
    try {
      const result = await reqOtp({
        data: { email: stage.email, password, displayName: displayName || undefined },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Code sent. Check your inbox.");
      setStage({ name: "verify", email: stage.email, password, expiresAt: result.expiresAt });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (stage.name !== "verify") return;
    const code = String(new FormData(e.currentTarget).get("code") ?? "").trim();
    if (!/^\d{4}$/.test(code)) return toast.error("Enter the 4-digit code");
    setBusy(true);
    try {
      await verifyOtp({ data: { email: stage.email, code, password: stage.password } });
      const { error } = await supabase.auth.signInWithPassword({
        email: stage.email,
        password: stage.password,
      });
      if (error) throw error;
      toast.success("Account created!");
      router.invalidate();
      navigate({ to: (next || "/send") as string });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center"
            style={{ background: "var(--gradient-cyber)", boxShadow: "var(--glow-primary)" }}
          >
            <Shield className="w-6 h-6 text-background" />
          </div>
          <div>
            <div className="text-xl font-bold tracking-wider">SecureVault</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Encryption Suite</div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/60 backdrop-blur-xl p-8 space-y-6">
          {stage.name === "email" && (
            <form onSubmit={handleEmailSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg border border-border bg-background/40">
                <button
                  type="button"
                  onClick={() => setStage({ name: "email", mode: "login" })}
                  className={`py-2 text-sm rounded-md transition-colors ${stage.mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => setStage({ name: "email", mode: "signup" })}
                  className={`py-2 text-sm rounded-md transition-colors ${stage.mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Sign up
                </button>
              </div>
              <div>
                <h2 className="text-xl font-semibold">
                  {stage.mode === "login" ? "Welcome back" : "Create your account"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {stage.mode === "login"
                    ? "Enter the email you signed up with."
                    : "We'll email you a 4-digit verification code."}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="email" name="email" type="email" required autoFocus placeholder="you@example.com" className="pl-9" />
                </div>
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4 ml-2" /></>}
              </Button>
            </form>
          )}

          {stage.name === "login" && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">Welcome back</h2>
                <p className="text-sm text-muted-foreground mt-1 break-all">
                  Logging in as <span className="text-foreground">{stage.email}</span>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="password" name="password" type="password" required autoFocus className="pl-9" />
                </div>
                <p className="text-xs text-muted-foreground">Use the password you set during signup.</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setStage({ name: "email", mode: "login" })}>
                  Back
                </Button>
                <Button type="submit" disabled={busy} className="flex-1">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Log in"}
                </Button>
              </div>
            </form>
          )}

          {stage.name === "signup" && (
            <form onSubmit={handleSignup} className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">Create your account</h2>
                <p className="text-sm text-muted-foreground mt-1 break-all">
                  We'll email a 4-digit code to <span className="text-foreground">{stage.email}</span>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Display name (optional)</Label>
                <Input id="displayName" name="displayName" maxLength={64} placeholder="What should we call you?" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" required minLength={8} placeholder="At least 8 characters" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" name="confirm" type="password" required minLength={8} />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setStage({ name: "email", mode: "login" })}>
                  Back
                </Button>
                <Button type="submit" disabled={busy} className="flex-1">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send code"}
                </Button>
              </div>
            </form>
          )}

          {stage.name === "verify" && (
            <form onSubmit={handleVerify} className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">Enter your code</h2>
                <p className="text-sm text-muted-foreground mt-1 break-all">
                  We sent a 4-digit code to <span className="text-foreground">{stage.email}</span>. It expires in 10 minutes.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Verification code</Label>
                <Input
                  id="code"
                  name="code"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  required
                  autoFocus
                  className="text-center text-2xl tracking-[0.6em] font-mono"
                  placeholder="••••"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setStage({ name: "signup", email: stage.email })}>
                  Back
                </Button>
                <Button type="submit" disabled={busy} className="flex-1">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify & create"}
                </Button>
              </div>
            </form>
          )}
        </div>

        <div className="text-center text-xs text-muted-foreground mt-6">
          <Link to="/" className="hover:text-foreground transition-colors">← Back to home</Link>
        </div>
      </div>
    </div>
  );
}
