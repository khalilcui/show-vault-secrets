import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Shield, Send, Inbox, Mail, GraduationCap, ArrowRight, IdCard } from "lucide-react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/Panel";
import { getMyProfile } from "@/lib/shares.functions";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "SecureVault — encrypted user-to-user messaging" },
      { name: "description", content: "Pick a cipher, send encrypted text or files directly to another user's unique ID, and watch every encryption step in plain language." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Index,
});

function Index() {
  const fetchProfile = useServerFn(getMyProfile);
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => { fetchProfile().then((p) => setCode(p.user_code)).catch(() => {}); }, [fetchProfile]);

  return (
    <AppShell>
      <div className="p-8 max-w-6xl mx-auto">
        <PageHeader
          title="Welcome to SecureVault"
          subtitle="Send encrypted messages directly to another user's ID — and learn how each cipher works as it runs."
          icon={Shield}
        />

        {code && (
          <Panel className="mb-6">
            <div className="flex items-start gap-4">
              <IdCard className="w-6 h-6 text-primary mt-1 shrink-0" />
              <div className="flex-1">
                <div className="font-bold text-foreground mb-1">Your User ID</div>
                <div className="flex items-center gap-3 mb-2">
                  <code className="text-2xl font-mono font-bold tracking-[0.25em] text-primary bg-primary/10 border border-primary/30 rounded-md px-4 py-2">
                    {code}
                  </code>
                </div>
                <p className="text-sm text-muted-foreground">
                  Give this ID to anyone who wants to send you an encrypted message. Only you can decrypt messages addressed to your ID — there are no public links.
                </p>
              </div>
            </div>
          </Panel>
        )}

        <div className="grid md:grid-cols-3 gap-5">
          <Link to="/send">
            <Panel className="hover:border-primary/60 transition-all cursor-pointer h-full">
              <Send className="w-6 h-6 text-primary mb-3" />
              <div className="font-bold text-foreground mb-1">Send</div>
              <div className="text-sm text-muted-foreground">Pick an algorithm, address it to a recipient's User ID, and encrypt.</div>
              <div className="mt-3 inline-flex items-center text-primary text-sm font-medium">
                Start <ArrowRight className="w-4 h-4 ml-1" />
              </div>
            </Panel>
          </Link>
          <Link to="/inbox">
            <Panel className="hover:border-primary/60 transition-all cursor-pointer h-full">
              <Inbox className="w-6 h-6 text-primary mb-3" />
              <div className="font-bold text-foreground mb-1">Inbox</div>
              <div className="text-sm text-muted-foreground">Messages addressed to your User ID, waiting to be decrypted.</div>
            </Panel>
          </Link>
          <Link to="/sent">
            <Panel className="hover:border-primary/60 transition-all cursor-pointer h-full">
              <Mail className="w-6 h-6 text-primary mb-3" />
              <div className="font-bold text-foreground mb-1">Sent</div>
              <div className="text-sm text-muted-foreground">Track which of your messages the recipient has opened.</div>
            </Panel>
          </Link>
        </div>

        <Panel className="mt-6">
          <div className="flex items-start gap-4">
            <GraduationCap className="w-6 h-6 text-primary mt-1 shrink-0" />
            <div>
              <div className="font-bold text-foreground mb-1">Built for real use — and for learning</div>
              <p className="text-sm text-muted-foreground">
                SecureVault supports AES-GCM (PBKDF2 key derivation, authenticated encryption) for real-world security, plus four classical ciphers — Caesar, Vigenère, Playfair, and Hill — so you can see exactly how each one transforms your message. Every encryption and decryption shows its internal steps in plain language.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
