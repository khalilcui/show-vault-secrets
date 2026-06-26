// Step-by-step traces for educational visibility into how each cipher encrypts.

import { aesEncrypt, aesDecrypt, bufToBase64, base64ToBuf } from "./crypto";
import { caesar, vigenere, playfair, hill } from "./ciphers";

export type TraceStep = { title: string; detail: string };

export type AlgoId = "aes-gcm-256" | "aes-gcm-128" | "caesar" | "vigenere" | "playfair" | "hill";

export const ALGO_LABEL: Record<AlgoId, string> = {
  "aes-gcm-256": "AES-GCM 256-bit",
  "aes-gcm-128": "AES-GCM 128-bit",
  caesar: "Caesar Cipher",
  vigenere: "Vigenère Cipher",
  playfair: "Playfair Cipher",
  hill: "Hill Cipher (2×2)",
};

export const ALGO_DESC: Record<AlgoId, string> = {
  "aes-gcm-256":
    "Modern symmetric cipher. The password is stretched with PBKDF2 (150k iterations, SHA-256) using a random 16-byte salt to derive a 256-bit AES key. Encryption uses AES-GCM with a fresh 12-byte IV; output bytes are [salt(16)][iv(12)][ciphertext+tag].",
  "aes-gcm-128":
    "Same as AES-256 but with a 128-bit key. Still secure; slightly faster on legacy hardware.",
  caesar:
    "Each letter is shifted by a fixed number of positions in the alphabet. Key = integer shift. Trivially broken — for learning only.",
  vigenere:
    "Polyalphabetic shift. Each letter is shifted by the corresponding letter of the (repeating) keyword. Stronger than Caesar but breakable with frequency analysis.",
  playfair:
    "Digraph substitution using a 5×5 letter square keyed by a passphrase (I/J merged). Each pair of letters is replaced according to row/column rules.",
  hill: "Linear algebra cipher. The 4-number key forms a 2×2 matrix; pairs of letters (as 0–25 values) are multiplied by the matrix modulo 26.",
};

export const NEEDS_BINARY_KEY: Record<AlgoId, "password" | "shift" | "word" | "matrix"> = {
  "aes-gcm-256": "password",
  "aes-gcm-128": "password",
  caesar: "shift",
  vigenere: "word",
  playfair: "word",
  hill: "matrix",
};

const enc = new TextEncoder();
const dec = new TextDecoder();

function preview(s: string, n = 40) {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

export async function encryptWithTrace(
  algo: AlgoId,
  key: string,
  data: ArrayBuffer,
  isFile: boolean,
): Promise<{ payloadB64: string; steps: TraceStep[] }> {
  const steps: TraceStep[] = [];
  steps.push({
    title: "1. Algorithm selected",
    detail: `${ALGO_LABEL[algo]} — ${ALGO_DESC[algo]}`,
  });

  if (algo === "aes-gcm-256" || algo === "aes-gcm-128") {
    if (!key) throw new Error("Password key is required for AES");
    const bits = algo === "aes-gcm-256" ? 256 : 128;
    steps.push({
      title: "2. Random salt + IV generated",
      detail: "16-byte salt and 12-byte initialization vector pulled from crypto.getRandomValues()",
    });
    steps.push({
      title: "3. Key derivation (PBKDF2)",
      detail: `Stretching your password with 150,000 SHA-256 iterations into a ${bits}-bit AES key`,
    });
    steps.push({
      title: "4. AES-GCM encrypt",
      detail: `Encrypting ${data.byteLength.toLocaleString()} bytes; the 16-byte authentication tag is appended to the ciphertext`,
    });
    const packed = await aesEncrypt(data, key, bits);
    const b64 = bufToBase64(packed);
    steps.push({
      title: "5. Packed output",
      detail: `[salt(16)][iv(12)][cipher+tag(${packed.byteLength - 28})] → ${packed.byteLength} bytes → base64 (${b64.length} chars)`,
    });
    return { payloadB64: b64, steps };
  }

  // Classical ciphers operate on text. For files we fall back to base64 before applying the cipher.
  const text = isFile ? bufToBase64(data) : dec.decode(data);
  let cipherText = "";
  if (algo === "caesar") {
    const shift = ((parseInt(key, 10) || 0) % 26 + 26) % 26;
    steps.push({
      title: "2. Parse shift",
      detail: `Key parsed as integer shift = ${shift} (mod 26)`,
    });
    steps.push({
      title: "3. Shift each letter",
      detail: `Each A-Z letter is moved ${shift} positions forward; case preserved, non-letters untouched.`,
    });
    cipherText = caesar.encrypt(text, key);
  } else if (algo === "vigenere") {
    if (!key.trim()) throw new Error("Vigenère keyword is required");
    steps.push({
      title: "2. Build repeating key",
      detail: `Keyword "${key.toUpperCase().replace(/[^A-Z]/g, "")}" cycled letter-by-letter across the message`,
    });
    steps.push({
      title: "3. Add shifts modulo 26",
      detail: "Each plaintext letter index + key letter index is taken mod 26",
    });
    cipherText = vigenere.encrypt(text, key);
  } else if (algo === "playfair") {
    if (!key.trim()) throw new Error("Playfair key is required");
    steps.push({
      title: "2. Build 5×5 keyed square",
      detail: `Filled with unique letters from "${key.toUpperCase()}" then the rest of the alphabet (I=J)`,
    });
    steps.push({
      title: "3. Split into digraphs and substitute",
      detail: "Each pair is replaced by row/column/rectangle rules of the keyed square",
    });
    cipherText = playfair.encrypt(text, key);
  } else if (algo === "hill") {
    steps.push({
      title: "2. Parse 2×2 matrix",
      detail: `Key parsed as [[a,b],[c,d]] from "${key}" (4 comma/space-separated integers)`,
    });
    steps.push({
      title: "3. Matrix multiply each digraph",
      detail: "Pairs of letters (mod 26 values) are multiplied by the key matrix modulo 26",
    });
    cipherText = hill.encrypt(text, key);
  } else {
    throw new Error("Unsupported algorithm");
  }

  steps.push({
    title: "4. Encode for transport",
    detail: `Cipher output (${cipherText.length} chars, preview "${preview(cipherText)}") wrapped as base64 so it travels safely`,
  });
  const payloadB64 = btoa(unescape(encodeURIComponent(cipherText)));
  return { payloadB64, steps };
}

export async function decryptWithTrace(
  algo: AlgoId,
  key: string,
  payloadB64: string,
  isFile: boolean,
): Promise<{ data: ArrayBuffer; text: string | null; steps: TraceStep[] }> {
  const steps: TraceStep[] = [];
  steps.push({
    title: "1. Algorithm identified by sender",
    detail: `${ALGO_LABEL[algo]} — ${ALGO_DESC[algo]}`,
  });

  if (algo === "aes-gcm-256" || algo === "aes-gcm-128") {
    if (!key) throw new Error("Password key is required");
    const bits = algo === "aes-gcm-256" ? 256 : 128;
    const packed = base64ToBuf(payloadB64);
    steps.push({
      title: "2. Unpack",
      detail: `${packed.byteLength} bytes split into salt(16) + iv(12) + ciphertext+tag(${packed.byteLength - 28})`,
    });
    steps.push({
      title: "3. Re-derive AES key (PBKDF2, 150k iterations)",
      detail: `Same salt + your password → ${bits}-bit AES key`,
    });
    steps.push({ title: "4. AES-GCM decrypt + verify tag", detail: "Tag mismatch = wrong key or tampered data → fails loudly" });
    const data = await aesDecrypt(packed, key, bits);
    return {
      data,
      text: isFile ? null : new TextDecoder().decode(data),
      steps,
    };
  }

  const raw = decodeURIComponent(escape(atob(payloadB64)));
  steps.push({ title: "2. Base64-decode transport wrapper", detail: `Got ${raw.length} cipher chars (preview "${preview(raw)}")` });
  let plain = "";
  if (algo === "caesar") plain = caesar.decrypt(raw, key);
  else if (algo === "vigenere") plain = vigenere.decrypt(raw, key);
  else if (algo === "playfair") plain = playfair.decrypt(raw, key);
  else if (algo === "hill") plain = hill.decrypt(raw, key);
  else throw new Error("Unsupported algorithm");
  steps.push({ title: "3. Reverse the cipher rule", detail: `Inverse operation applied with the receiver's key` });

  if (isFile) {
    const buf = base64ToBuf(plain);
    steps.push({ title: "4. Restore file bytes", detail: `Plaintext was base64-encoded original file → ${buf.byteLength} bytes` });
    return { data: buf, text: null, steps };
  }
  return { data: enc.encode(plain).buffer, text: plain, steps };
}
