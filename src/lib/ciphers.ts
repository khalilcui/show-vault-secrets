// Educational classical ciphers (text only, A-Z)

const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function clean(s: string) {
  return s.toUpperCase().replace(/[^A-Z]/g, "");
}

export const caesar = {
  encrypt(text: string, key: string) {
    const shift = ((parseInt(key, 10) || 0) % 26 + 26) % 26;
    return text
      .split("")
      .map((c) => {
        const u = c.toUpperCase();
        const i = A.indexOf(u);
        if (i < 0) return c;
        const out = A[(i + shift) % 26];
        return c === u ? out : out.toLowerCase();
      })
      .join("");
  },
  decrypt(text: string, key: string) {
    const shift = parseInt(key, 10) || 0;
    return caesar.encrypt(text, String(-shift));
  },
};

export const vigenere = {
  process(text: string, key: string, decrypt = false) {
    const k = clean(key);
    if (!k) return text;
    let ki = 0;
    return text
      .split("")
      .map((c) => {
        const u = c.toUpperCase();
        const i = A.indexOf(u);
        if (i < 0) return c;
        const shift = A.indexOf(k[ki % k.length]) * (decrypt ? -1 : 1);
        ki++;
        const out = A[(i + shift + 26) % 26];
        return c === u ? out : out.toLowerCase();
      })
      .join("");
  },
  encrypt(t: string, k: string) {
    return vigenere.process(t, k, false);
  },
  decrypt(t: string, k: string) {
    return vigenere.process(t, k, true);
  },
};

// Playfair
function playfairTable(key: string) {
  const seen = new Set<string>();
  const k = clean(key).replace(/J/g, "I");
  const letters: string[] = [];
  for (const c of k + "ABCDEFGHIKLMNOPQRSTUVWXYZ") {
    if (!seen.has(c)) {
      seen.add(c);
      letters.push(c);
    }
  }
  return letters;
}
function pfPos(t: string[], c: string) {
  const i = t.indexOf(c);
  return [Math.floor(i / 5), i % 5];
}
export const playfair = {
  encrypt(text: string, key: string) {
    const t = playfairTable(key);
    let s = clean(text).replace(/J/g, "I");
    const pairs: string[] = [];
    for (let i = 0; i < s.length; ) {
      const a = s[i];
      let b = s[i + 1];
      if (!b || a === b) {
        b = "X";
        i += 1;
      } else {
        i += 2;
      }
      pairs.push(a + b);
    }
    return pairs
      .map(([a, b]) => {
        const [r1, c1] = pfPos(t, a);
        const [r2, c2] = pfPos(t, b);
        if (r1 === r2) return t[r1 * 5 + ((c1 + 1) % 5)] + t[r2 * 5 + ((c2 + 1) % 5)];
        if (c1 === c2) return t[((r1 + 1) % 5) * 5 + c1] + t[((r2 + 1) % 5) * 5 + c2];
        return t[r1 * 5 + c2] + t[r2 * 5 + c1];
      })
      .join("");
  },
  decrypt(text: string, key: string) {
    const t = playfairTable(key);
    const s = clean(text);
    let out = "";
    for (let i = 0; i < s.length; i += 2) {
      const a = s[i];
      const b = s[i + 1];
      if (!b) break;
      const [r1, c1] = pfPos(t, a);
      const [r2, c2] = pfPos(t, b);
      if (r1 === r2) out += t[r1 * 5 + ((c1 + 4) % 5)] + t[r2 * 5 + ((c2 + 4) % 5)];
      else if (c1 === c2) out += t[((r1 + 4) % 5) * 5 + c1] + t[((r2 + 4) % 5) * 5 + c2];
      else out += t[r1 * 5 + c2] + t[r2 * 5 + c1];
    }
    return out;
  },
};

// Hill 2x2
function modInv(a: number, m = 26) {
  a = ((a % m) + m) % m;
  for (let x = 1; x < m; x++) if ((a * x) % m === 1) return x;
  return -1;
}
function parseHillKey(key: string) {
  const nums = key
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((n) => parseInt(n, 10));
  if (nums.length !== 4 || nums.some(isNaN)) throw new Error("Hill key needs 4 numbers (e.g. 3,3,2,5)");
  return nums as [number, number, number, number];
}
export const hill = {
  encrypt(text: string, key: string) {
    const [a, b, c, d] = parseHillKey(key);
    let s = clean(text);
    if (s.length % 2) s += "X";
    let out = "";
    for (let i = 0; i < s.length; i += 2) {
      const x = A.indexOf(s[i]);
      const y = A.indexOf(s[i + 1]);
      out += A[(a * x + b * y) % 26] + A[(c * x + d * y) % 26];
    }
    return out;
  },
  decrypt(text: string, key: string) {
    const [a, b, c, d] = parseHillKey(key);
    const det = ((a * d - b * c) % 26 + 26) % 26;
    const inv = modInv(det);
    if (inv < 0) throw new Error("Hill key matrix is not invertible mod 26");
    const ia = (d * inv) % 26;
    const ib = ((-b * inv) % 26 + 26) % 26;
    const ic = ((-c * inv) % 26 + 26) % 26;
    const id = (a * inv) % 26;
    const s = clean(text);
    let out = "";
    for (let i = 0; i < s.length; i += 2) {
      const x = A.indexOf(s[i]);
      const y = A.indexOf(s[i + 1]);
      out += A[(ia * x + ib * y + 26 * 26) % 26] + A[(ic * x + id * y + 26 * 26) % 26];
    }
    return out;
  },
};