import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { Shield, Send, Inbox, Mail, LogOut, IdCard, Copy, Check, Menu } from "lucide-react";
import type { ReactNode, ComponentType } from "react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { getMyProfile } from "@/lib/shares.functions";

const nav = [
  { to: "/send", label: "Send", icon: Send },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/sent", label: "Sent", icon: Mail },
] as const;

type Profile = { user_code: string; email: string; display_name: string | null };

function SidebarContent({
  profile,
  pathname,
  onNavigate,
  onSignOut,
}: {
  profile: Profile | null;
  pathname: string;
  onNavigate?: () => void;
  onSignOut: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copyCode() {
    if (!profile?.user_code) return;
    await navigator.clipboard.writeText(profile.user_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="flex h-full flex-col">
      <div className="p-6 border-b border-border">
        <Link to="/" className="flex items-center gap-3" onClick={onNavigate}>
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--gradient-cyber)", boxShadow: "var(--glow-primary)" }}
          >
            <Shield className="w-5 h-5 text-background" />
          </div>
          <div className="min-w-0">
            <div className="font-bold tracking-wider text-foreground truncate">SecureVault</div>
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
            <code className="flex-1 min-w-0 text-primary font-mono text-sm font-bold tracking-wider bg-primary/10 border border-primary/30 rounded px-2 py-1.5 truncate">
              {profile.user_code}
            </code>
            <Button size="sm" variant="outline" className="h-8 w-8 p-0 shrink-0" onClick={copyCode} title="Copy your User ID">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      )}

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {nav.map((n) => {
          const active = pathname === n.to || pathname.startsWith(n.to + "/");
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all ${
                active
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/40 border border-transparent"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {n.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border space-y-3">
        {profile && (
          <div className="text-xs min-w-0">
            <div className="text-muted-foreground uppercase tracking-widest text-[10px]">Signed in</div>
            <div className="text-foreground truncate" title={profile.email}>{profile.display_name || profile.email}</div>
          </div>
        )}
        <Button variant="outline" size="sm" className="w-full" onClick={onSignOut}>
          <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  return (
    <div className="min-h-screen md:flex">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-sidebar/80 backdrop-blur-xl px-4 py-3">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
            style={{ background: "var(--gradient-cyber)" }}
          >
            <Shield className="w-4 h-4 text-background" />
          </div>
          <span className="font-bold tracking-wider text-foreground truncate">SecureVault</span>
        </Link>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 w-9 p-0" aria-label="Open menu">
              <Menu className="w-4 h-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-sidebar border-border">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContent
              profile={profile}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
              onSignOut={handleSignOut}
            />
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-sidebar/60 backdrop-blur-xl flex-col">
        <SidebarContent profile={profile} pathname={pathname} onSignOut={handleSignOut} />
      </aside>

      <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
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
    <div className="mb-6 sm:mb-8 flex items-center gap-3 sm:gap-4">
      {Icon && (
        <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-lg flex items-center justify-center border border-primary/30 bg-primary/10">
          <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
        </div>
      )}
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-wide text-foreground truncate">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
