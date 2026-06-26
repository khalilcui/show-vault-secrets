import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mail, FileText, MessageSquare } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/Panel";
import { listSent } from "@/lib/shares.functions";
import { ALGO_LABEL, type AlgoId } from "@/lib/trace";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sent")({
  head: () => ({
    meta: [
      { title: "Sent — SecureVault" },
      { name: "description", content: "Encrypted messages you've sent and whether the recipient has opened them." },
    ],
  }),
  component: SentPage,
});

type Row = Awaited<ReturnType<typeof listSent>>[number];

function SentPage() {
  const fetchSent = useServerFn(listSent);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetchSent()
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load sent items"));
  }, [fetchSent]);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto p-8">
        <PageHeader title="Sent" subtitle="Encrypted messages you've sent to other users." icon={Mail} />

        {rows === null ? (
          <Panel><p className="text-sm text-muted-foreground">Loading…</p></Panel>
        ) : rows.length === 0 ? (
          <Panel>
            <p className="text-sm text-muted-foreground">You haven't sent anything yet.</p>
          </Panel>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <Panel key={r.id} className="!p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="w-10 h-10 rounded-md flex items-center justify-center border border-primary/30 bg-primary/10 shrink-0">
                    {r.is_file ? <FileText className="w-5 h-5 text-primary" /> : <MessageSquare className="w-5 h-5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-semibold text-foreground">
                      {r.is_file ? (r.file_name ?? "File") : "Text message"}
                      {" "}· <span className="text-primary text-xs font-mono">{ALGO_LABEL[r.algorithm as AlgoId] ?? r.algorithm}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      To <span className="text-foreground font-mono">{r.recipient_code}</span> · {new Date(r.created_at).toLocaleString()}
                      {r.hint && <> · hint: "{r.hint}"</>}
                    </div>
                  </div>
                  <div className="text-xs">
                    {r.opened_at ? (
                      <span className="text-primary">✓ Opened {new Date(r.opened_at).toLocaleString()}</span>
                    ) : (
                      <span className="text-muted-foreground">Not opened yet</span>
                    )}
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
