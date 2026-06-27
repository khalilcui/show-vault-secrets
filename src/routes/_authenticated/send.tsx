import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Send, FileUp, Type, Loader2, Sparkles, ListChecks, UserCheck, ArrowRight, Download,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  encryptWithTrace, ALGO_LABEL, ALGO_DESC, NEEDS_BINARY_KEY,
  type AlgoId, type TraceStep,
} from "@/lib/trace";
import { findUserByCode, sendToUser } from "@/lib/shares.functions";
import { buildEncryptReport, stashEncryptReport, downloadReport } from "@/lib/trace-report";

export const Route = createFileRoute("/_authenticated/send")({
  head: () => ({
    meta: [
      { title: "Send encrypted — SecureVault" },
      { name: "description", content: "Encrypt a message and send it to another user's ID." },
    ],
  }),
  component: SendPage,
});

const ALGOS: AlgoId[] = ["aes-gcm-256", "aes-gcm-128", "caesar", "vigenere", "playfair", "hill"];

function keyPlaceholder(algo: AlgoId): string {
  switch (NEEDS_BINARY_KEY[algo]) {
    case "password": return "Strong passphrase";
    case "shift": return "Integer shift, e.g. 3";
    case "word": return "Keyword (letters only)";
    case "matrix": return "4 numbers, e.g. 3,3,2,5";
  }
}

type Recipient = { id: string; user_code: string; display_name: string | null; email_masked: string | null };

function SendPage() {
  const navigate = useNavigate();

  const [recipientCode, setRecipientCode] = useState("");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const [algo, setAlgo] = useState<AlgoId>("aes-gcm-256");
  const [mode, setMode] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [lastSent, setLastSent] = useState<{ id: string; report: string } | null>(null);

  const lookup = useServerFn(findUserByCode);
  const send = useServerFn(sendToUser);

  const description = useMemo(() => ALGO_DESC[algo], [algo]);

  async function handleLookup() {
    const code = recipientCode.trim().toUpperCase();
    if (!code) return;
    setLookingUp(true);
    try {
      const found = await lookup({ data: { userCode: code } });
      if (!found) {
        setRecipient(null);
        toast.error(`No user found with ID "${code}"`);
      } else {
        setRecipient(found);
        toast.success(`Found ${found.user_code}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLookingUp(false);
    }
  }

  async function handleEncryptAndSend() {
    if (!recipient) return toast.error("Confirm the recipient first");
    if (!key.trim()) return toast.error("Enter a decryption key");
    if (mode === "text" && !text.trim()) return toast.error("Enter some text");
    if (mode === "file" && !file) return toast.error("Pick a file");

    setBusy(true);
    setSteps([]);
    setLastSent(null);
    try {
      const isFile = mode === "file";
      const data: ArrayBuffer = isFile
        ? await file!.arrayBuffer()
        : (new TextEncoder().encode(text).buffer as ArrayBuffer);

      const { payloadB64, steps } = await encryptWithTrace(algo, key, data, isFile);
      setSteps(steps);

      const row = await send({
        data: {
          recipientCode: recipient.user_code,
          algorithm: algo,
          payloadB64,
          isFile,
          fileName: isFile ? file!.name : null,
          fileMime: isFile ? file!.type || "application/octet-stream" : null,
          hint: hint.trim() || null,
        },
      });

      // Build & stash the per-message encryption report (text mode only).
      if (!isFile) {
        const report = await buildEncryptReport({
          messageId: row.id,
          algo,
          key,
          plaintext: text,
          payloadB64,
          recipientCode: recipient.user_code,
          createdAt: row.created_at,
        });
        stashEncryptReport(row.id, report);
        setLastSent({ id: row.id, report });
      }

      toast.success(`Sent to ${recipient.user_code}`);
      setText("");
      setFile(null);
      setTimeout(() => navigate({ to: "/sent" }), 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto p-4 sm:p-8">
        <PageHeader
          title="Send Encrypted Message"
          subtitle="Encrypted in your browser. Only the recipient can read it."
          icon={Send}
        />

        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-6">
            <Panel title="1. Recipient">
              <div className="space-y-3">
                <Label htmlFor="rcpt">Recipient's User ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="rcpt"
                    value={recipientCode}
                    onChange={(e) => { setRecipientCode(e.target.value.toUpperCase()); setRecipient(null); }}
                    placeholder="e.g. A1B2C3D4"
                    className="font-mono tracking-widest uppercase"
                    maxLength={16}
                  />
                  <Button onClick={handleLookup} disabled={lookingUp || !recipientCode.trim()}>
                    {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                  </Button>
                </div>
                {recipient && (
                  <div className="flex items-center gap-3 border border-primary/30 bg-primary/5 rounded-md p-3 text-sm">
                    <UserCheck className="w-5 h-5 text-primary" />
                    <div>
                      <div className="text-foreground font-semibold">
                        {recipient.display_name || "User"} · <span className="font-mono text-primary">{recipient.user_code}</span>
                      </div>
                      {recipient.email_masked && <div className="text-xs text-muted-foreground">{recipient.email_masked}</div>}
                    </div>
                  </div>
                )}
              </div>
            </Panel>

            <Panel title="2. Algorithm">
              <div className="space-y-3">
                <Select value={algo} onValueChange={(v) => setAlgo(v as AlgoId)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALGOS.map((a) => <SelectItem key={a} value={a}>{ALGO_LABEL[a]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </Panel>

            <Panel title="3. Payload">
              <Tabs value={mode} onValueChange={(v) => setMode(v as "text" | "file")}>
                <TabsList>
                  <TabsTrigger value="text"><Type className="w-4 h-4 mr-2" />Text</TabsTrigger>
                  <TabsTrigger value="file"><FileUp className="w-4 h-4 mr-2" />File</TabsTrigger>
                </TabsList>
                <TabsContent value="text" className="mt-4">
                  <Textarea rows={6} placeholder="Type your secret message…" value={text} onChange={(e) => setText(e.target.value)} />
                </TabsContent>
                <TabsContent value="file" className="mt-4 space-y-2">
                  <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  {file && <p className="text-xs text-muted-foreground">{file.name} — {(file.size / 1024).toFixed(1)} KB</p>}
                </TabsContent>
              </Tabs>
            </Panel>

            <Panel title="4. Key">
              <div className="space-y-3">
                <Input
                  id="key" value={key} onChange={(e) => setKey(e.target.value)}
                  placeholder={keyPlaceholder(algo)}
                  type={NEEDS_BINARY_KEY[algo] === "password" ? "password" : "text"}
                />
                <Input value={hint} onChange={(e) => setHint(e.target.value)} placeholder='Optional hint, e.g. "cafe street name"' maxLength={280} />
              </div>
            </Panel>

            <Button onClick={handleEncryptAndSend} disabled={busy || !recipient} size="lg" className="w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Encrypt & send to {recipient ? recipient.user_code : "recipient"}
              {!busy && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>

            {lastSent && (
              <Panel title="Encryption report ready">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm text-muted-foreground">
                    Step-by-step report for this exact message — only you can download it.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => downloadReport(lastSent.id, "encrypt", lastSent.report)}
                  >
                    <Download className="w-4 h-4 mr-2" /> Download .txt
                  </Button>
                </div>
              </Panel>
            )}
          </div>

          <div className="space-y-6">
            <Panel title={<span className="flex items-center gap-2"><ListChecks className="w-4 h-4" /> Encryption steps</span>}>
              {steps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Each step will appear here after you click Encrypt &amp; send.</p>
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
        </div>
      </div>
    </AppShell>
  );
}
