import type { MailMessage } from "./mailer";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Email sent to a new teammate with their login credentials. Spanish —
 * this deployment's language. Plain-text + a simple inline-styled HTML
 * version (email clients strip <style>, so styles are inline).
 */
export function teammateCredentialsEmail(params: {
  accountName: string;
  email: string;
  password: string;
  loginUrl: string;
}): MailMessage {
  const { accountName, email, password, loginUrl } = params;

  const subject = `Tu acceso a ${accountName}`;

  const text = [
    `Hola,`,
    ``,
    `Se ha creado tu cuenta para acceder al software de ${accountName}.`,
    ``,
    `Estos son tus datos para iniciar sesión:`,
    `  Correo: ${email}`,
    `  Contraseña: ${password}`,
    ``,
    `Entra aquí: ${loginUrl}`,
    ``,
    `Te recomendamos cambiar la contraseña después de entrar.`,
    ``,
    `Un saludo,`,
    accountName,
  ].join("\n");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111827;">
    <h2 style="margin:0 0 12px;">Tu acceso a ${escapeHtml(accountName)}</h2>
    <p style="margin:0 0 16px;line-height:1.5;">
      Se ha creado tu cuenta para acceder al software de
      <strong>${escapeHtml(accountName)}</strong>. Estos son tus datos para
      iniciar sesión:
    </p>
    <table style="border-collapse:collapse;margin:0 0 20px;">
      <tr>
        <td style="padding:6px 12px;color:#6b7280;">Correo</td>
        <td style="padding:6px 12px;font-weight:600;">${escapeHtml(email)}</td>
      </tr>
      <tr>
        <td style="padding:6px 12px;color:#6b7280;">Contraseña</td>
        <td style="padding:6px 12px;font-weight:600;font-family:monospace;">${escapeHtml(password)}</td>
      </tr>
    </table>
    <p style="margin:0 0 20px;">
      <a href="${escapeHtml(loginUrl)}"
         style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">
        Iniciar sesión
      </a>
    </p>
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.5;">
      Si el botón no funciona, copia este enlace: <br>
      <span style="word-break:break-all;">${escapeHtml(loginUrl)}</span>
    </p>
    <p style="margin:16px 0 0;color:#6b7280;font-size:13px;">
      Te recomendamos cambiar la contraseña después de entrar.
    </p>
  </div>`;

  return { to: email, subject, text, html };
}
