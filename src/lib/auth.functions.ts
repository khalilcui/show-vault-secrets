// Custom signup OTP flow:
// 1. requestSignupOtp -> stores hashed code + hashed password, emails 4-digit code
// 2. verifySignupOtp  -> on match, creates the auth user with email pre-confirmed
// Login uses the standard supabase.auth.signInWithPassword from the client.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email")
  .max(255);

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128);

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fourDigit(): string {
  // 0000..9999 from a uniform random byte stream (mod bias is negligible at this size for learning use)
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 10000).padStart(4, "0");
}

// ---------- public: does this email already have an account? ----------
export const checkEmailExists = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ email: emailSchema }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // listUsers paginates; for small projects this is fine. We page until found.
    let page = 1;
    while (page <= 20) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(error.message);
      if (list.users.some((u) => (u.email ?? "").toLowerCase() === data.email)) {
        return { exists: true };
      }
      if (list.users.length < 200) break;
      page++;
    }
    return { exists: false };
  });

// ---------- step 1: request a signup OTP ----------
export const requestSignupOtp = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        email: emailSchema,
        password: passwordSchema,
        displayName: z.string().trim().min(1).max(64).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendEmail, otpEmailHtml, EmailDeliveryError } = await import("@/lib/email.server");

    // Block if user already exists
    let page = 1;
    while (page <= 20) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      if (list.users.some((u) => (u.email ?? "").toLowerCase() === data.email)) {
        throw new Error("This email already has an account. Please log in instead.");
      }
      if (list.users.length < 200) break;
      page++;
    }

    const code = fourDigit();
    const codeHash = await sha256Hex(code);
    const passwordHash = await sha256Hex(data.password); // temporary holder for the pending password
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: upsertErr } = await supabaseAdmin
      .from("signup_otps")
      .upsert(
        {
          email: data.email,
          code_hash: codeHash,
          password_hash: passwordHash,
          display_name: data.displayName ?? null,
          attempts: 0,
          expires_at: expiresAt,
        },
        { onConflict: "email" },
      );
    if (upsertErr) throw new Error(upsertErr.message);

    try {
      await sendEmail({
        to: data.email,
        subject: `Your SecureVault code: ${code}`,
        html: otpEmailHtml(code),
      });
    } catch (err) {
      await supabaseAdmin.from("signup_otps").delete().eq("email", data.email);

      if (err instanceof EmailDeliveryError) {
        return { ok: false as const, error: err.message };
      }

      console.error("Unexpected verification email failure", err);
      return {
        ok: false as const,
        error: "Verification email could not be sent right now. Please try again shortly.",
      };
    }

    return { ok: true as const, expiresAt };
  });

// ---------- step 2: verify the OTP and create the account ----------
export const verifySignupOtp = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        email: emailSchema,
        code: z.string().regex(/^\d{4}$/u, "Code must be 4 digits"),
        // password retransmitted from the form so we use the exact same one the user set
        password: passwordSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("signup_otps")
      .select("*")
      .eq("email", data.email)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!row) throw new Error("No pending verification. Please request a new code.");

    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("This code has expired. Request a new one.");
    }
    if (row.attempts >= 5) {
      throw new Error("Too many attempts. Request a new code.");
    }

    const incomingHash = await sha256Hex(data.code);
    const passwordHash = await sha256Hex(data.password);

    if (incomingHash !== row.code_hash || passwordHash !== row.password_hash) {
      await supabaseAdmin
        .from("signup_otps")
        .update({ attempts: row.attempts + 1 })
        .eq("email", data.email);
      throw new Error("Incorrect code. Please try again.");
    }

    // Create the user with email already confirmed (we just verified ownership)
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: row.display_name ? { display_name: row.display_name } : undefined,
    });
    if (createErr) throw new Error(createErr.message);

    await supabaseAdmin.from("signup_otps").delete().eq("email", data.email);

    return { ok: true as const };
  });
