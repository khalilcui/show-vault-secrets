import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Send, FileUp, Type, Loader2, Lightbulb, Sparkles, ListChecks, UserCheck, ArrowRight, ShieldCheck,
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

export const Route = createFileRoute("/_authenticated/send")({
  head: () => ({
    meta: [
      { title: "Send encrypted — SecureVault" },
      { name: "description", content: "Address an encrypted message to another user's ID. Watch each encryption step as it runs." },
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

type Recipient = { id: string; user_code: string; display_name: string | null; email_masked: string };

function SendPage() {
  const navigate = useNavigate();

  // recipient lookup
  const [recipientCode, setRecipientCode] = useState("");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  // encryption inputs
  const [algo, setAlgo] = useState<AlgoId>("aes-gcm-256");
  const [mode, setMode] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<TraceStep[]>([]);

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
        toast.success(`Found user ${found.user_code}`);
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

      toast.success(`Sent to ${recipient.user_code}`);
      // jump to outbox so the user sees their sent message
      setTimeout(() => navigate({ to: "/sent" }), 600);
      // reset payload but keep the trace visible so the user can study it
      setText("");
      setFile(null);
      void row;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto p-8">
        <PageHeader
          title="Send Encrypted Message"
          subtitle="Encrypt in your browser and deliver it directly to another user's ID. Only they can read it."
          icon={Send}
        />

        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-6">
            <Panel title="1. Who's the recipient?">
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
                      <div className="text-xs text-muted-foreground">{recipient.email_masked}</div>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  The recipient must already have a SecureVault account. Their User ID appears in their sidebar and dashboard.
                </p>
              </div>
            </Panel>

            <Panel title="2. Pick an algorithm">
              <div className="space-y-3">
                <Select value={algo} onValueChange={(v) => setAlgo(v as AlgoId)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALGOS.map((a) => <SelectItem key={a} value={a}>{ALGO_LABEL[a]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-2 items-start text-sm text-muted-foreground border border-border rounded-md p-3 bg-secondary/30">
                  <Lightbulb className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <p>{description}</p>
                </div>
              </div>
            </Panel>

            <Panel title="3. What do you want to send?">
              <Tabs value={mode} onValueChange={(v) => setMode(v as "text" | "file")}>
                <TabsList>
                  <TabsTrigger value="text"><Type className="w-4 h-4 mr-2" />Text</TabsTrigger>
                  <TabsTrigger value="file"><FileUp className="w-4 h-4 mr-2" />File</TabsTrigger>
                </TabsList>
                <TabsContent value="text" className="mt-4">
                  <Textarea rows={8} placeholder="Type your secret message…" value={text} onChange={(e) => setText(e.target.value)} />
                </TabsContent>
                <TabsContent value="file" className="mt-4 space-y-2">
                  <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  {file && <p className="text-xs text-muted-foreground">{file.name} — {(file.size / 1024).toFixed(1)} KB</p>}
                  {(algo === "caesar" || algo === "vigenere" || algo === "playfair" || algo === "hill") && file && (
                    <p className="text-xs text-yellow-500/80">
                      Classical ciphers work on letters only — file bytes will be base64-encoded before encrypting (expect a much larger payload).
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </Panel>

            <Panel title="4. Decryption key">
              <div className="space-y-3">
                <Label htmlFor="key">Key (the recipient will need this!)</Label>
                <Input
                  id="key" value={key} onChange={(e) => setKey(e.target.value)}
                  placeholder={keyPlaceholder(algo)}
                  type={NEEDS_BINARY_KEY[algo] === "password" ? "password" : "text"}
                />
                <p className="text-xs text-muted-foreground">
                  Tell the recipient this key through a separate channel (chat, in person, phone). Without it, even the recipient can't decrypt the message.
                </p>
                <Label htmlFor="hint">Hint for the recipient (optional)</Label>
                <Input id="hint" value={hint} onChange={(e) => setHint(e.target.value)} placeholder='e.g. "our cafe street name"' maxLength={280} />
              </div>
            </Panel>

            <Button onClick={handleEncryptAndSend} disabled={busy || !recipient} size="lg" className="w-full">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Encrypt & send to {recipient ? recipient.user_code : "recipient"}
              {!busy && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </div>

          <div className="space-y-6">
            <Panel title={<span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Privacy</span>}>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
                <li>Your message is encrypted <span className="text-foreground">in this browser</span> before it ever touches the server.</li>
                <li>The recipient field is the only person allowed to read it.</li>
                <li>The server never sees your decryption key.</li>
              </ul>
            </Panel>

            <Panel title={<span className="flex items-center gap-2"><ListChecks className="w-4 h-4" /> How it's encrypted</span>}>
              {steps.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Each step the cipher takes will appear here after you click <span className="text-foreground">Encrypt &amp; send</span>.
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
        </div>
      </div>
    </AppShell>
  );
}
