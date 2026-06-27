import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mail, FileText, MessageSquare, Download, Loader2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { listSent } from "@/lib/shares.functions";
import { ALGO_LABEL, NEEDS_BINARY_KEY, type AlgoId } from "@/lib/trace";
import {
  buildEncryptReport, readEncryptReport, stashEncryptReport, downloadReport,
} from "@/lib/trace-report";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sent")({
  head: () => ({
    meta: [
      { title: "Sent — SecureVault" },
      { name: "description", content: "Messages you've sent." },
    ],
  }),
  component: SentPage,
});

type Row = Awaited<ReturnType<typeof listSent>>[number];

function SentPage() {
  const fetchSent = useServerFn(listSent);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [regenFor, setRegenFor] = useState<Row | null>(null);
  const [regenKey, setRegenKey] = useState("");
  const [regenPlain, setRegenPlain] = useState("");
  const [regenBusy, setRegenBusy] = useState(false);

  useEffect(() => {
    fetchSent()
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load sent items"));
  }, [fetchSent]);

  async function handleDownload(r: Row) {
    if (r.is_file) {
      toast.info("Step reports are only generated for text messages.");
      return;
    }
    const cached = readEncryptReport(r.id);
    if (cached) {
      downloadReport(r.id, "encrypt", cached);
      return;
    }
    setRegenFor(r);
    setRegenKey("");
    setRegenPlain("");
  }

  async function handleRegen() {
    if (!regenFor) return;
    if (!regenKey || !regenPlain) {
      toast.error("Both the original message and key are required to rebuild the report.");
      return;
    }
    setRegenBusy(true);
    try {
      // We need the actual payload_b64 — refetch via getMessage would be cleaner,
      // but listSent doesn't include it. Just re-encrypt to verify and rebuild trace.
      const { encryptWithTrace } = await import("@/lib/trace");
      const data = new TextEncoder().encode(regenPlain).buffer as ArrayBuffer;
      const { payloadB64 } = await encryptWithTrace(regenFor.algorithm as AlgoId, regenKey, data, false);
      const report = await buildEncryptReport({
        messageId: regenFor.id,
        algo: regenFor.algorithm as AlgoId,
        key: regenKey,
        plaintext: regenPlain,
        payloadB64,
        recipientCode: regenFor.recipient_code ?? undefined,
        createdAt: regenFor.created_at,
      });
      stashEncryptReport(regenFor.id, report);
      downloadReport(regenFor.id, "encrypt", report);
      setRegenFor(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rebuild report");
    } finally {
      setRegenBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto p-4 sm:p-8">
        <PageHeader title="Sent" subtitle="Encrypted messages you've sent." icon={Mail} />

        {rows === null ? (
          <Panel><p className="text-sm text-muted-foreground">Loading…</p></Panel>
        ) : rows.length === 0 ? (
          <Panel><p className="text-sm text-muted-foreground">You haven't sent anything yet.</p></Panel>
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
                      <span className="text-primary">✓ Opened</span>
                    ) : (
                      <span className="text-muted-foreground">Not opened</span>
                    )}
                  </div>
                  {!r.is_file && (
                    <Button size="sm" variant="outline" onClick={() => handleDownload(r)}>
                      <Download className="w-4 h-4 mr-2" /> Steps
                    </Button>
                  )}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!regenFor} onOpenChange={(o) => !o && setRegenFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rebuild encryption report</DialogTitle>
            <DialogDescription>
              The step-by-step report for this message isn't on this device.
              Re-enter the original message and key to regenerate it. Nothing leaves your browser.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="rp">Original message</Label>
              <Textarea id="rp" rows={3} value={regenPlain} onChange={(e) => setRegenPlain(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="rk">Key</Label>
              <Input
                id="rk"
                value={regenKey}
                onChange={(e) => setRegenKey(e.target.value)}
                type={regenFor && NEEDS_BINARY_KEY[regenFor.algorithm as AlgoId] === "password" ? "password" : "text"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRegenFor(null)}>Cancel</Button>
            <Button onClick={handleRegen} disabled={regenBusy}>
              {regenBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              Build & download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
