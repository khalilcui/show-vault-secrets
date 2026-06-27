// Per-user direct delivery: sender encrypts and addresses a message to a recipient
// using the recipient's short user_code. Only sender and recipient can ever read it.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateShareCode } from "@/lib/share-code";

const algorithmSchema = z.enum([
  "aes-gcm-256",
  "aes-gcm-128",
  "caesar",
  "vigenere",
  "playfair",
  "hill",
]);

const userCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(6, "User ID looks too short")
  .max(16, "User ID looks too long")
  .regex(/^[A-Z0-9]+$/u, "User IDs are letters & numbers only");

// ---------- current user's profile (their User ID + display name) ----------
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, email, display_name, user_code")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Profile not found");
    return data;
  });

// ---------- look up a recipient by their User ID ----------
// Uses a SECURITY DEFINER RPC so we never expose other users' emails via the profiles table.
export const findUserByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userCode: userCodeSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .rpc("find_profile_by_code", { _code: data.userCode });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return null;
    return {
      id: row.id,
      user_code: row.user_code,
      display_name: row.display_name,
      email_masked: null as string | null,
    };
  });


}

// ---------- send: address an encrypted payload to a specific user ----------
export const sendToUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        recipientCode: userCodeSchema,
        algorithm: algorithmSchema,
        payloadB64: z.string().min(1).max(8 * 1024 * 1024),
        isFile: z.boolean(),
        fileName: z.string().max(255).optional().nullable(),
        fileMime: z.string().max(120).optional().nullable(),
        hint: z.string().max(280).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    const { data: recipient, error: recErr } = await supabase
      .from("profiles")
      .select("id, user_code, display_name")
      .eq("user_code", data.recipientCode)
      .maybeSingle();
    if (recErr) throw new Error(recErr.message);
    if (!recipient) throw new Error(`No user found with ID "${data.recipientCode}". Ask them for their exact User ID.`);
    // Note: self-send is allowed (useful for testing the encryption flow).

    const senderEmail = (claims.email as string | undefined) ?? "unknown";

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateShareCode(10);
      const { data: row, error } = await supabase
        .from("shared_messages")
        .insert({
          code,
          sender_id: userId,
          sender_email: senderEmail,
          recipient_id: recipient.id,
          recipient_code: recipient.user_code,
          algorithm: data.algorithm,
          payload_b64: data.payloadB64,
          is_file: data.isFile,
          file_name: data.fileName ?? null,
          file_mime: data.fileMime ?? null,
          hint: data.hint ?? null,
        })
        .select("id, code, created_at, recipient_code")
        .single();
      if (!error && row) {
        return {
          ...row,
          recipient_display_name: recipient.display_name,
        };
      }
      if (error && !`${error.message}`.toLowerCase().includes("duplicate")) {
        throw new Error(error.message);
      }
    }
    throw new Error("Could not allocate a message ID. Try again.");
  });

// ---------- one message (sender OR recipient can read; RLS enforces it) ----------
export const getMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("shared_messages")
      .select(
        "id, code, algorithm, payload_b64, file_name, file_mime, is_file, hint, sender_email, sender_id, recipient_id, recipient_code, created_at, opened_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return row;
  });

// ---------- mark a message opened (recipient only; RLS enforces) ----------
export const markMessageOpened = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("shared_messages")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("opened_at", null);
    return { ok: true };
  });

// ---------- inbox: messages addressed TO me ----------
export const listInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("shared_messages")
      .select("id, code, algorithm, is_file, file_name, hint, sender_email, created_at, opened_at")
      .eq("recipient_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- outbox: messages I've sent ----------
export const listSent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("shared_messages")
      .select("id, code, algorithm, is_file, file_name, hint, recipient_code, created_at, opened_at")
      .eq("sender_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
