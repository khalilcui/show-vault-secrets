import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, FileText, MessageSquare, ArrowRight } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/Panel";
import { listInbox } from "@/lib/shares.functions";
import { ALGO_LABEL, type AlgoId } from "@/lib/trace";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — SecureVault" },
      { name: "description", content: "Encrypted messages addressed to your User ID." },
    ],
  }),
  component: InboxPage,
});

type Row = Awaited<ReturnType<typeof listInbox>>[number];

function InboxPage() {
  const fetchInbox = useServerFn(listInbox);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetchInbox()
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load inbox"));
  }, [fetchInbox]);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto p-8">
        <PageHeader title="Inbox" subtitle="Encrypted messages sent to your User ID." icon={Inbox} />

        {rows === null ? (
          <Panel><p className="text-sm text-muted-foreground">Loading…</p></Panel>
        ) : rows.length === 0 ? (
          <Panel>
            <p className="text-sm text-muted-foreground">
              Nothing here yet. Share your <span className="text-primary font-mono">User ID</span> with someone so they can send you an encrypted message.
            </p>
          </Panel>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <Link key={r.id} to="/m/$id" params={{ id: r.id }}>
                <Panel className="!p-4 hover:border-primary/60 transition-all cursor-pointer">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="w-10 h-10 rounded-md flex items-center justify-center border border-primary/30 bg-primary/10 shrink-0">
                      {r.is_file ? <FileText className="w-5 h-5 text-primary" /> : <MessageSquare className="w-5 h-5 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <div className="font-semibold text-foreground">
                        {r.is_file ? (r.file_name ?? "File") : "Text message"}
                        {" "}· <span className="text-primary text-xs font-mono">{ALGO_LABEL[r.algorithm as AlgoId] ?? r.algorithm}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 break-all">
                        From <span className="text-foreground">{r.sender_email}</span> · {new Date(r.created_at).toLocaleString()}
                        {r.hint && <> · hint: "{r.hint}"</>}
                      </div>
                    </div>
                    <div className="text-xs">
                      {r.opened_at ? (
                        <span className="text-muted-foreground">Opened</span>
                      ) : (
                        <span className="text-primary font-semibold">New</span>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Panel>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
