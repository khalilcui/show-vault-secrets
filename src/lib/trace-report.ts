// Build a per-message, human-readable text report of how a specific message
// was encrypted or decrypted. Designed to be downloaded by the sender/receiver
// of that exact message — different content for every message.

import { encryptWithTrace, decryptWithTrace, ALGO_LABEL, type AlgoId } from "./trace";
import { downloadBlob } from "./crypto";

const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function header(title: string) {
  const bar = "=".repeat(title.length);
  return `${title}\n${bar}\n`;
}

function bytesPreview(buf: ArrayBuffer, max = 32) {
  const u = new Uint8Array(buf);
  const slice = Array.from(u.slice(0, max))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  return slice + (u.length > max ? `  …(+${u.length - max} more bytes)` : "");
}

function classicalPerChar(
  algo: AlgoId,
  key: string,
  plaintext: string,
  direction: "encrypt" | "decrypt",
): string {
  const lines: string[] = [];
  const txt = plaintext;

  if (algo === "caesar") {
    const shift = ((parseInt(key, 10) || 0) % 26 + 26) % 26;
    const eff = direction === "encrypt" ? shift : (26 - shift) % 26;
    lines.push(`Shift used: ${direction === "encrypt" ? shift : -shift} (mod 26 = ${eff})`);
    lines.push("");
    lines.push("char  index  shift  →  out");
    for (const c of txt) {
      const u = c.toUpperCase();
      const i = A.indexOf(u);
      if (i < 0) {
        lines.push(`  ${c}     —      —    →   ${c}   (non-letter, unchanged)`);
        continue;
      }
      const j = (i + eff) % 26;
      const out = c === u ? A[j] : A[j].toLowerCase();
      lines.push(`  ${c}     ${String(i).padStart(2)}     ${String(eff).padStart(2)}   →   ${out}`);
    }
  } else if (algo === "vigenere") {
    const k = key.toUpperCase().replace(/[^A-Z]/g, "");
    if (!k) return "";
    lines.push(`Keyword: ${k}  (repeats across letters; non-letters skipped)`);
    lines.push("");
    lines.push("char  idx   key  kidx  ±  →  out");
    let ki = 0;
    for (const c of txt) {
      const u = c.toUpperCase();
      const i = A.indexOf(u);
      if (i < 0) {
        lines.push(`  ${c}    —     —    —    —  →   ${c}`);
        continue;
      }
      const kc = k[ki % k.length];
      const ks = A.indexOf(kc) * (direction === "encrypt" ? 1 : -1);
      const j = ((i + ks) % 26 + 26) % 26;
      const out = c === u ? A[j] : A[j].toLowerCase();
      lines.push(
        `  ${c}    ${String(i).padStart(2)}    ${kc}    ${String(A.indexOf(kc)).padStart(2)}   ${ks >= 0 ? "+" : "-"}${Math.abs(ks)}  →   ${out}`,
      );
      ki++;
    }
  } else if (algo === "playfair") {
    lines.push(`Key "${key.toUpperCase()}" builds a 5×5 square (I/J merged).`);
    lines.push("Plaintext is split into digraphs; each pair is replaced by row/column rules.");
    lines.push("");
    const clean = txt.toUpperCase().replace(/[^A-Z]/g, "").replace(/J/g, "I");
    for (let i = 0; i < clean.length; i += 2) {
      const pair = clean.slice(i, i + 2);
      lines.push(`  digraph "${pair}" → substituted via Playfair square`);
    }
  } else if (algo === "hill") {
    lines.push(`Key matrix parsed from "${key}" — pairs of letters are multiplied mod 26.`);
    lines.push("");
    const clean = txt.toUpperCase().replace(/[^A-Z]/g, "");
    for (let i = 0; i < clean.length; i += 2) {
      const a = clean[i] ?? "X";
      const b = clean[i + 1] ?? "X";
      lines.push(`  pair "${a}${b}"  (values ${A.indexOf(a)}, ${A.indexOf(b)}) → matrix · vector mod 26`);
    }
  }
  return lines.join("\n");
}

export async function buildEncryptReport(opts: {
  messageId: string;
  algo: AlgoId;
  key: string;
  plaintext: string;
  payloadB64: string;
  recipientCode?: string;
  createdAt?: string;
}): Promise<string> {
  const { messageId, algo, key, plaintext, payloadB64, recipientCode, createdAt } = opts;
  const buf = new TextEncoder().encode(plaintext).buffer as ArrayBuffer;
  const { steps } = await encryptWithTrace(algo, key, buf, false);

  const out: string[] = [];
  out.push(header(`SecureVault — Encryption Steps Report`));
  out.push(`Message ID:       ${messageId}`);
  out.push(`Algorithm:        ${ALGO_LABEL[algo]}`);
  if (recipientCode) out.push(`Sent to user:     ${recipientCode}`);
  if (createdAt) out.push(`Sent at:          ${new Date(createdAt).toLocaleString()}`);
  out.push(`Original message: "${plaintext}"`);
  out.push(`Length:           ${plaintext.length} characters, ${buf.byteLength} bytes`);
  out.push(`Plaintext bytes:  ${bytesPreview(buf)}`);
  out.push("");
  out.push(header("Step-by-step"));
  steps.forEach((s, i) => {
    out.push(`Step ${i + 1}. ${s.title}`);
    out.push(`         ${s.detail}`);
    out.push("");
  });

  if (algo !== "aes-gcm-128" && algo !== "aes-gcm-256") {
    out.push(header("Per-character transformation"));
    out.push(classicalPerChar(algo, key, plaintext, "encrypt"));
    out.push("");
  }

  out.push(header("Final encrypted payload (base64)"));
  out.push(payloadB64);
  out.push("");
  out.push("— End of report —");
  return out.join("\n");
}

export async function buildDecryptReport(opts: {
  messageId: string;
  algo: AlgoId;
  key: string;
  payloadB64: string;
  plaintext: string;
  senderEmail?: string;
  createdAt?: string;
}): Promise<string> {
  const { messageId, algo, key, payloadB64, plaintext, senderEmail, createdAt } = opts;
  const { steps } = await decryptWithTrace(algo, key, payloadB64, false);

  const out: string[] = [];
  out.push(header(`SecureVault — Decryption Steps Report`));
  out.push(`Message ID:       ${messageId}`);
  out.push(`Algorithm:        ${ALGO_LABEL[algo]}`);
  if (senderEmail) out.push(`From:             ${senderEmail}`);
  if (createdAt) out.push(`Received:         ${new Date(createdAt).toLocaleString()}`);
  out.push(`Encrypted (b64):  ${payloadB64.slice(0, 80)}${payloadB64.length > 80 ? "…" : ""}`);
  out.push(`Recovered text:   "${plaintext}"`);
  out.push("");
  out.push(header("Step-by-step"));
  steps.forEach((s, i) => {
    out.push(`Step ${i + 1}. ${s.title}`);
    out.push(`         ${s.detail}`);
    out.push("");
  });

  if (algo !== "aes-gcm-128" && algo !== "aes-gcm-256") {
    out.push(header("Per-character reverse transformation"));
    out.push(classicalPerChar(algo, key, plaintext, "decrypt"));
    out.push("");
  }

  out.push("— End of report —");
  return out.join("\n");
}

// localStorage cache so reports survive page reloads on the same device.
const ENC_KEY = (id: string) => `sv:enc-report:${id}`;
const DEC_KEY = (id: string) => `sv:dec-report:${id}`;

export function stashEncryptReport(id: string, text: string) {
  try { localStorage.setItem(ENC_KEY(id), text); } catch { /* quota */ }
}
export function stashDecryptReport(id: string, text: string) {
  try { localStorage.setItem(DEC_KEY(id), text); } catch { /* quota */ }
}
export function readEncryptReport(id: string) {
  try { return localStorage.getItem(ENC_KEY(id)); } catch { return null; }
}
export function readDecryptReport(id: string) {
  try { return localStorage.getItem(DEC_KEY(id)); } catch { return null; }
}

export function downloadReport(id: string, kind: "encrypt" | "decrypt", text: string) {
  const name = `${kind}-steps-${id.slice(0, 8)}.txt`;
  downloadBlob(text, name, "text/plain;charset=utf-8");
}
