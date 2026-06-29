import { createFileRoute, Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Shield, Mail, KeyRound, ArrowRight, Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in or sign up — SecureVault" },
      { name: "description", content: "Create your SecureVault account or log in to send encrypted files and messages." },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
});

type Mode = "login" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { next } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: (next || "/send") as string });
    });
  }, [navigate, next]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const password = String(fd.get("password") ?? "");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    const displayName = String(fd.get("displayName") ?? "").trim();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords don't match");
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/send`,
          data: displayName ? { display_name: displayName } : undefined,
        },
      });
      if (error) throw error;
      // If email confirmation is required, session is null and user must verify via email link.
      if (!data.session) {
        setSentTo(email);
        toast.success("Check your email to confirm your account.");
      } else {
        toast.success("Account created!");
        router.invalidate();
        navigate({ to: (next || "/send") as string });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Signup failed");
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
          {sentTo ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <MailCheck className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Confirm your email</h2>
              <p className="text-sm text-muted-foreground break-all">
                We sent a confirmation link to <span className="text-foreground">{sentTo}</span>.
                Click it to activate your account, then come back and log in.
              </p>
              <Button className="w-full" onClick={() => { setSentTo(null); setMode("login"); }}>
                Back to log in
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg border border-border bg-background/40">
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className={`py-2 text-sm rounded-md transition-colors ${mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className={`py-2 text-sm rounded-md transition-colors ${mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Sign up
                </button>
              </div>

              {mode === "login" ? (
                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <h2 className="text-xl font-semibold">Welcome back</h2>
                    <p className="text-sm text-muted-foreground mt-1">Log in to your account.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="email" name="email" type="email" required autoFocus placeholder="you@example.com" className="pl-9" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="password" name="password" type="password" required className="pl-9" />
                    </div>
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Log in <ArrowRight className="w-4 h-4 ml-2" /></>}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleSignup} className="space-y-5">
                  <div>
                    <h2 className="text-xl font-semibold">Create your account</h2>
                    <p className="text-sm text-muted-foreground mt-1">We'll email you a confirmation link.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="email" name="email" type="email" required placeholder="you@example.com" className="pl-9" />
                    </div>
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
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create account"}
                  </Button>
                </form>
              )}
            </>
          )}
        </div>

        <div className="text-center text-xs text-muted-foreground mt-6">
          <Link to="/" className="hover:text-foreground transition-colors">← Back to home</Link>
        </div>
      </div>
    </div>
  );
}
