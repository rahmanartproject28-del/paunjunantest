// Pengirim email untuk lupa sandi. Produksi: isi SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
// (Hostinger: smtp.hostinger.com, port 465). Tanpa SMTP: kode dicetak di log server (pengembangan saja).
import type { Mailer } from './accounts';

export async function makeMailer(): Promise<Mailer> {
  const env = process.env;
  if (!env.SMTP_HOST) return async (to, subject, text) => { console.log(`[EMAIL uji] ke ${to} · ${subject}\n${text}`); };
  const nm = await import('nodemailer');
  const tr = nm.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT ?? 465), secure: Number(env.SMTP_PORT ?? 465) === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  return async (to, subject, text) => { await tr.sendMail({ from: env.SMTP_FROM ?? env.SMTP_USER, to, subject, text }); };
}
