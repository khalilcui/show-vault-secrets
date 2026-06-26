// Web Crypto helpers for AES & RSA + SHA-256

const enc = new TextEncoder();

export function bufToBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function base64ToBuf(b64: string) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

async function deriveAesKey(password: string, salt: Uint8Array, bits: 128 | 256) {
  const mat = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 150_000, hash: "SHA-256" },
    mat,
    { name: "AES-GCM", length: bits },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function aesEncrypt(data: ArrayBuffer, password: string, bits: 128 | 256) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, bits);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data);
  // packed: [salt(16)][iv(12)][ct]
  const out = new Uint8Array(16 + 12 + ct.byteLength);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(new Uint8Array(ct), 28);
  return out.buffer;
}

export async function aesDecrypt(packed: ArrayBuffer, password: string, bits: 128 | 256) {
  const arr = new Uint8Array(packed);
  const salt = arr.slice(0, 16);
  const iv = arr.slice(16, 28);
  const ct = arr.slice(28);
  const key = await deriveAesKey(password, salt, bits);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct);
}

export async function sha256Hex(data: ArrayBuffer | string) {
  const buf = typeof data === "string" ? enc.encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateRsaKeyPair() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const pub = await crypto.subtle.exportKey("spki", pair.publicKey);
  const priv = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return { publicKey: bufToBase64(pub), privateKey: bufToBase64(priv) };
}

export async function rsaEncrypt(data: ArrayBuffer, publicKeyB64: string) {
  const key = await crypto.subtle.importKey(
    "spki",
    base64ToBuf(publicKeyB64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  // RSA-OAEP 2048 fits ~190 bytes. For larger files, hybrid encrypt: AES + wrap key.
  return crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, data);
}

export async function rsaDecrypt(data: ArrayBuffer, privateKeyB64: string) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    base64ToBuf(privateKeyB64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
  return crypto.subtle.decrypt({ name: "RSA-OAEP" }, key, data);
}

export function readFile(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

export function downloadBlob(data: ArrayBuffer | string, filename: string, mime = "application/octet-stream") {
  const blob = new Blob([data instanceof ArrayBuffer ? new Uint8Array(data) : data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function checkPasswordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Very Weak", "Weak", "Fair", "Good", "Strong", "Very Strong", "Excellent"];
  return { score, max: 6, label: labels[score] ?? "Excellent" };
}