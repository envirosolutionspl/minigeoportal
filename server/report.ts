import nodemailer from 'nodemailer';
import { RequestError } from './http.ts';

/**
 * Bug reports from the app, sent by e-mail to the administrator. The mail server and the
 * recipient come from the environment (see .env.example); without them the form is off.
 *
 * The message is plain text built from validated fields only: the subject names a fixed
 * category, the sender's address goes to Reply-To, and nothing from the form is rendered as HTML.
 */

export const CATEGORIES = {
  mapa: 'Mapa lub warstwy',
  wyszukiwanie: 'Wyszukiwanie',
  dzialki: 'Działki i informacje o miejscu',
  dostepnosc: 'Dostępność',
  inne: 'Inne',
} as const;

export type Category = keyof typeof CATEGORIES;

export interface Report {
  category: Category;
  message: string;
  email?: string;
  /** Map view the report refers to (the app's own URL). */
  view?: string;
}

export interface Mailer {
  send(report: Report, meta: { userAgent?: string }): Promise<void>;
}

const MESSAGE = { min: 10, max: 3000 };
const EMAIL = /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

/** Control characters except line breaks and tabs. */
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

/**
 * Validates a submitted form. `website` is a field hidden from people: bots fill it in, and
 * such a report is accepted silently but not sent (returns null).
 */
export function parseReport(body: unknown, appOrigin: string): Report | null {
  if (!body || typeof body !== 'object') throw new RequestError('Nieprawidłowe zgłoszenie');
  const b = body as Record<string, unknown>;
  if (typeof b.website === 'string' && b.website !== '') return null;

  const category = b.category;
  if (typeof category !== 'string' || !Object.hasOwn(CATEGORIES, category)) throw new RequestError('Wybierz rodzaj zgłoszenia');

  const message = typeof b.message === 'string' ? clean(b.message) : '';
  if (message.length < MESSAGE.min || message.length > MESSAGE.max) {
    throw new RequestError(`Opis powinien mieć od ${MESSAGE.min} do ${MESSAGE.max} znaków`);
  }

  let email: string | undefined;
  if (typeof b.email === 'string' && b.email.trim() !== '') {
    email = b.email.trim();
    if (email.length > 254 || !EMAIL.test(email)) throw new RequestError('Nieprawidłowy adres e-mail');
  }

  // Only a link to this app is kept, so the mail cannot carry arbitrary links.
  let view: string | undefined;
  if (typeof b.view === 'string' && b.view.length <= 2000) {
    try {
      const url = new URL(b.view);
      if (url.origin === appOrigin) view = url.href;
    } catch {
      // Not a URL: dropped.
    }
  }

  return { category: category as Category, message, email, view };
}

export function formatReport(report: Report, meta: { userAgent?: string }): { subject: string; text: string } {
  const lines = [
    `Rodzaj: ${CATEGORIES[report.category]}`,
    `Kontakt: ${report.email ?? 'nie podano'}`,
    `Widok mapy: ${report.view ?? 'nie dołączono'}`,
    `Przeglądarka: ${meta.userAgent ? clean(meta.userAgent).slice(0, 300) : 'nieznana'}`,
    '',
    report.message,
  ];
  return { subject: `[Prosty Geoportal] Zgłoszenie: ${CATEGORIES[report.category]}`, text: lines.join('\n') };
}

/** SMTP mailer from the environment, or undefined when the form is not configured. */
export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer | undefined {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, REPORT_TO, REPORT_FROM } = env;
  if (!SMTP_HOST || !REPORT_TO) return undefined;
  const port = Number(SMTP_PORT ?? 587);
  const secure = SMTP_SECURE ? SMTP_SECURE === 'true' : port === 465;
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure,
    // Credentials never go out in the clear: STARTTLS is required when the connection is not TLS from the start.
    requireTLS: !secure,
    tls: { minVersion: 'TLSv1.2' },
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return {
    async send(report, meta) {
      const { subject, text } = formatReport(report, meta);
      await transport.sendMail({ from: REPORT_FROM ?? SMTP_USER, to: REPORT_TO, replyTo: report.email, subject, text });
    },
  };
}
