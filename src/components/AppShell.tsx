import { createFileRoute, Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { Shield, Send, Inbox, Mail, LogOut, IdCard, Copy, Check } from "lucide-react";
import type { ReactNode, ComponentType } from "react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getMyProfile } from "@/lib/shares.functions";

const nav = [
  { to: "/send", label: "Send", icon: Send },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/sent", label: "Sent", icon: Mail },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const [profile, setProfile] = useState<{ user_code: string; email: string; display_name: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchProfile()
      .then((p) => setProfile({ user_code: p.user_code, email: p.email, display_name: p.display_name }))
      .catch(() => {});
  }, [fetchProfile]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/auth", replace: true });
  }

  async function copyCode() {
    if (!profile?.user_code) return;
    await navigator.clipboard.writeText(profile.user_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 border-r border-border bg-sidebar/60 backdrop-blur-xl flex flex-col">
        <div className="p-6 border-b border-border">
          <Link to="/" className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: "var(--gradient-cyber)", boxShadow: "var(--glow-primary)" }}
            >
              <Shield className="w-5 h-5 text-background" />
            </div>
            <div>
              <div className="font-bold tracking-wider text-foreground">SecureVault</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Encryption Suite</div>
            </div>
          </Link>
        </div>

        {profile && (
          <div className="px-4 py-4 border-b border-border">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <IdCard className="w-3 h-3" /> Your User ID
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-primary font-mono text-sm font-bold tracking-wider bg-primary/10 border border-primary/30 rounded px-2 py-1.5">
                {profile.user_code}
              </code>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={copyCode} title="Copy your User ID">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1.5">
              Share this so others can send you encrypted messages.
            </div>
          </div>
        )}

        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => {
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all ${
                  active
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/40 border border-transparent"
                }`}
              >
                <Icon className="w-4 h-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border space-y-3">
          {profile && (
            <div className="text-xs">
              <div className="text-muted-foreground uppercase tracking-widest text-[10px]">Signed in</div>
              <div className="text-foreground truncate" title={profile.email}>{profile.display_name || profile.email}</div>
            </div>
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={handleSignOut}>
            <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
          </Button>
          <div className="text-[10px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              CLIENT-SIDE ENCRYPTION
            </div>
            <div className="mt-1">Plaintext never leaves your browser.</div>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-8 flex items-center gap-4">
      {Icon && (
        <div className="w-12 h-12 rounded-lg flex items-center justify-center border border-primary/30 bg-primary/10">
          <Icon className="w-6 h-6 text-primary" />
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold tracking-wide text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
