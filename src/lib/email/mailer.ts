import nodemailer, { type Transporter } from "nodemailer";

// Transactional email over SMTP (designed for Gmail with an app
// password, but any SMTP host works). Configuration comes from env:
//
//   SMTP_HOST   (default smtp.gmail.com)
//   SMTP_PORT   (default 465)
//   SMTP_SECURE ("true"/"false"; default: true when port is 465)
//   SMTP_USER   the sending mailbox (e.g. venusecretsbcn@gmail.com)
//   SMTP_PASS   the app password / SMTP password
//   SMTP_FROM   optional display From (default: SMTP_USER)
//
// When SMTP_USER / SMTP_PASS are absent the feature degrades
// gracefully: `isEmailConfigured()` returns false and callers fall back
// to showing the credentials on screen instead of failing.

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function emailFrom(): string {
  return process.env.SMTP_FROM?.trim() || process.env.SMTP_USER!;
}

let _transporter: Transporter | null = null;

function transporter(): Transporter {
  if (!_transporter) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    const secure = process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : port === 465;
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
      },
    });
  }
  return _transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Send an email. Throws if SMTP isn't configured or delivery fails —
 *  callers decide whether that's fatal or a soft fallback. */
export async function sendMail(msg: MailMessage): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("SMTP is not configured (missing SMTP_USER / SMTP_PASS)");
  }
  await transporter().sendMail({
    from: emailFrom(),
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
}
