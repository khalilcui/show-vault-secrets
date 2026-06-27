import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Download, Loader2, KeyRound, Inbox, FileText, ShieldAlert, ListChecks, Lightbulb, ArrowLeft,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  decryptWithTrace, ALGO_LABEL, ALGO_DESC, NEEDS_BINARY_KEY,
  type AlgoId, type TraceStep,
} from "@/lib/trace";
import { downloadBlob } from "@/lib/crypto";
import { buildDecryptReport, stashDecryptReport, downloadReport } from "@/lib/trace-report";
import { getMessage, markMessageOpened } from "@/lib/shares.functions";

export const Route = createFileRoute("/_authenticated/m/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Open encrypted message — SecureVault` },
      { name: "description", content: `Decrypt the encrypted message sent to your User ID (${params.id.slice(0, 8)}).` },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OpenMessagePage,
});

type Message = Awaited<ReturnType<typeof getMessage>>;

function OpenMessagePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchMessage = useServerFn(getMessage);
  const markOpened = useServerFn(markMessageOpened);

  const [msg, setMsg] = useState<Message>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [plainText, setPlainText] = useState<string | null>(null);
  const [decryptedFile, setDecryptedFile] = useState<{ buf: ArrayBuffer; name: string; mime: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMessage({ data: { id } })
      .then((row) => {
        if (cancelled) return;
        if (!row) setNotFound(true);
        else {
          setMsg(row);
          markOpened({ data: { id } }).catch(() => {});
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load message"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id, fetchMessage, markOpened]);

  async function handleDecrypt() {
    if (!msg) return;
    if (!key.trim()) return toast.error("Enter the decryption key");
    setBusy(true);
    setPlainText(null);
    setDecryptedFile(null);
    try {
      const { data, text, steps } = await decryptWithTrace(
        msg.algorithm as AlgoId, key, msg.payload_b64, msg.is_file,
      );
      setSteps(steps);
      if (msg.is_file) {
        setDecryptedFile({
          buf: data,
          name: msg.file_name ?? "decrypted.bin",
          mime: msg.file_mime ?? "application/octet-stream",
        });
        toast.success("Decrypted — ready to download");
      } else {
        setPlainText(text ?? "");
        // Build & stash the per-message decryption report (text only).
        try {
          const report = await buildDecryptReport({
            messageId: msg.id,
            algo: msg.algorithm as AlgoId,
            key,
            payloadB64: msg.payload_b64,
            plaintext: text ?? "",
            senderEmail: msg.sender_email,
            createdAt: msg.created_at,
          });
          stashDecryptReport(msg.id, report);
        } catch { /* ignore report errors */ }
        toast.success("Decrypted!");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Decryption failed — wrong key?");
    } finally {
      setBusy(false);
    }
  }

  function handleDownloadReport() {
    if (!msg || plainText === null) return;
    // Rebuild fresh in case key changed.
    buildDecryptReport({
      messageId: msg.id,
      algo: msg.algorithm as AlgoId,
      key,
      payloadB64: msg.payload_b64,
      plaintext: plainText,
      senderEmail: msg.sender_email,
      createdAt: msg.created_at,
    }).then((r) => downloadReport(msg.id, "decrypt", r));
  }

  if (loading) {
    return (
      <AppShell>
        <div className="p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (notFound || !msg) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto p-12 text-center">
          <ShieldAlert className="w-10 h-10 text-destructive mx-auto mb-3" />
          <h1 className="text-lg font-semibold">Message not found</h1>
          <p className="text-sm text-muted-foreground mt-1">
            It may have been deleted, or it wasn't addressed to your User ID.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/inbox" })}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to inbox
          </Button>
        </div>
      </AppShell>
    );
  }

  const algo = msg.algorithm as AlgoId;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto p-4 sm:p-8">
        <Link to="/inbox" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to inbox
        </Link>

        <PageHeader
          title="Encrypted message"
          subtitle={`From ${msg.sender_email} · ${new Date(msg.created_at).toLocaleString()}`}
          icon={Inbox}
        />

        <Tabs defaultValue="decrypt">
          <TabsList>
            <TabsTrigger value="decrypt"><KeyRound className="w-4 h-4 mr-2" />Decrypt</TabsTrigger>
            <TabsTrigger value="how"><Lightbulb className="w-4 h-4 mr-2" />How {ALGO_LABEL[algo]} works</TabsTrigger>
            <TabsTrigger value="raw"><FileText className="w-4 h-4 mr-2" />Raw ciphertext</TabsTrigger>
          </TabsList>

          <TabsContent value="decrypt" className="mt-6">
            <div className="grid lg:grid-cols-[1fr_380px] gap-6">
              <Panel title="Decrypt with the sender's key">
                <div className="space-y-4">
                  <div className="text-sm border border-border rounded-md p-3 bg-secondary/30 space-y-1">
                    <div><span className="text-muted-foreground">Algorithm used by sender:</span> <span className="font-semibold text-primary">{ALGO_LABEL[algo]}</span></div>
                    <div><span className="text-muted-foreground">Payload type:</span> {msg.is_file ? `File — ${msg.file_name}` : "Text message"}</div>
                    {msg.hint && <div><span className="text-muted-foreground">Hint from sender:</span> <span className="text-foreground">{msg.hint}</span></div>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="rkey">Decryption key</Label>
                    <Input
                      id="rkey" value={key} onChange={(e) => setKey(e.target.value)}
                      type={NEEDS_BINARY_KEY[algo] === "password" ? "password" : "text"}
                      placeholder="The exact key the sender shared with you"
                    />
                  </div>

                  <Button onClick={handleDecrypt} disabled={busy} className="w-full" size="lg">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
                    Decrypt
                  </Button>

                  {plainText !== null && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Decrypted message</Label>
                        <Button size="sm" variant="outline" onClick={handleDownloadReport}>
                          <Download className="w-4 h-4 mr-2" /> Steps
                        </Button>
                      </div>
                      <div className="rounded-md border border-primary/30 bg-primary/5 p-4 whitespace-pre-wrap font-mono text-sm">
                        {plainText || <span className="text-muted-foreground italic">(empty)</span>}
                      </div>
                    </div>
                  )}

                  {decryptedFile && (
                    <div className="space-y-2">
                      <Label>Decrypted file</Label>
                      <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 p-3">
                        <div className="text-sm">
                          <div className="font-medium">{decryptedFile.name}</div>
                          <div className="text-xs text-muted-foreground">{decryptedFile.mime} · {(decryptedFile.buf.byteLength / 1024).toFixed(1)} KB</div>
                        </div>
                        <Button size="sm" onClick={() => downloadBlob(decryptedFile.buf, decryptedFile.name, decryptedFile.mime)}>
                          <Download className="w-4 h-4 mr-2" />Download
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Panel>

              <Panel title={<span className="flex items-center gap-2"><ListChecks className="w-4 h-4" />Decryption steps</span>}>
                {steps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Steps appear here after you decrypt.
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {steps.map((s, i) => (
                      <li key={i} className="border-l-2 border-primary/40 pl-3">
                        <div className="text-sm font-semibold text-foreground">{s.title}</div>
                        <div className="text-xs text-muted-foreground mt-1 break-words">{s.detail}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="how" className="mt-6">
            <Panel title={ALGO_LABEL[algo]}>
              <p className="text-sm text-muted-foreground leading-relaxed">{ALGO_DESC[algo]}</p>
            </Panel>
          </TabsContent>

          <TabsContent value="raw" className="mt-6">
            <Panel title="Encrypted payload (base64)">
              <pre className="text-xs font-mono break-all whitespace-pre-wrap text-muted-foreground bg-secondary/30 rounded-md p-3 max-h-96 overflow-auto">
                {msg.payload_b64}
              </pre>
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
