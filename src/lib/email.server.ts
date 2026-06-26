// Server-only: send transactional email via Resend.
// Imported with the `.server.ts` extension to keep it out of the client bundle.

const RESEND_URL = "https://api.resend.com/emails";

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      from: opts.from ?? "SecureVault <onboarding@resend.dev>",
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const isInvalidKey =
      res.status === 401 ||
      res.status === 403 ||
      (res.status === 400 && /api key is invalid/i.test(text));

    if (isInvalidKey) {
      console.error(`Email provider rejected RESEND_API_KEY: ${res.status}`);
      throw new EmailDeliveryError(
        "Verification email could not be sent because the email service key is invalid. Update RESEND_API_KEY and try again.",
        res.status,
      );
    }

    console.error(`Email provider send failed: ${res.status} ${text}`);
    throw new EmailDeliveryError(
      "Verification email could not be sent right now. Please try again shortly.",
      res.status,
    );
  }
}

export function otpEmailHtml(code: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;background:#0b1220;color:#e6f7ff;padding:32px">
    <div style="max-width:480px;margin:0 auto;background:#13203a;border:1px solid #1f3258;border-radius:12px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#5eead4">SecureVault verification</h1>
      <p style="margin:0 0 24px;color:#94a3b8">Use this 4-digit code to finish creating your account. It expires in 10 minutes.</p>
      <div style="font-size:40px;letter-spacing:14px;font-weight:700;text-align:center;background:#0b1220;border:1px solid #1f3258;border-radius:8px;padding:18px;color:#5eead4">${code}</div>
      <p style="margin:24px 0 0;color:#64748b;font-size:12px">If you didn't request this, ignore this email.</p>
    </div></body></html>`;
}
