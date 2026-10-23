import nodemailer from 'nodemailer';
import { RequestError } from './http.ts';
import type { ClientConfig } from '../shared/config.ts';
import { EMAIL_MAX, MESSAGE } from '../shared/report.ts';

/**
 * Bug reports from the app, sent by e-mail to the administrator. The mail server and the
 * recipient come from the environment (see .env.example); without them the form is off.
 *
 * The message is plain text built from validated fields only: the subject names a fixed
 * category, the sender's address goes to Reply-To, and nothing from the form is rendered as HTML.
 */

/** The app's name, the report categories and the texts of the mail, in the language mails are written in. */
export type ReportForm = { app: Pick<ClientConfig['app'], 'name'>; report: ClientConfig['report']; messages: ClientConfig['messages'] };

export interface Report {
  /** Id of one of the configured categories. */
  category: string;
  message: string;
  email?: string;
  /** Map view the report refers to (the app's own URL). */
  view?: string;
}

export interface Mailer {
  send(report: Report, meta: { userAgent?: string }): Promise<void>;
}

const EMAIL = /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

/** Control characters except line breaks and tabs. */
// eslint-disable-next-line no-control-regex -- the control characters are the point here
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

/**
 * Validates a submitted form. `website` is a field hidden from people: bots fill it in, and
 * such a report is accepted silently but not sent (returns null).
 */
export function parseReport(body: unknown, appOrigin: string, form: ReportForm): Report | null {
  if (!body || typeof body !== 'object') throw new RequestError('Invalid report', 'invalid');
  const b = body as Record<string, unknown>;
  if (typeof b.website === 'string' && b.website !== '') return null;

  const category = b.category;
  if (typeof category !== 'string' || !form.report.categories.some((c) => c.id === category))
    throw new RequestError('Unknown category', 'category');

  const message = typeof b.message === 'string' ? clean(b.message) : '';
  if (message.length < MESSAGE.min || message.length > MESSAGE.max) {
    throw new RequestError(`Message must have ${MESSAGE.min} to ${MESSAGE.max} characters`, 'message');
  }

  let email: string | undefined;
  if (typeof b.email === 'string' && b.email.trim() !== '') {
    email = b.email.trim();
    if (email.length > EMAIL_MAX || !EMAIL.test(email)) throw new RequestError('Invalid e-mail address', 'email');
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

  return { category, message, email, view };
}

export function formatReport(report: Report, meta: { userAgent?: string }, form: ReportForm): { subject: string; text: string } {
  const category = form.report.categories.find((c) => c.id === report.category)?.label ?? report.category;
  const say = (key: string, params: Record<string, string> = {}) =>
    String(form.messages[`report.mail.${key}`] ?? key).replace(/\{(\w+)\}/g, (all, name: string) => params[name] ?? all);
  const lines = [
    `${say('category')}: ${category}`,
    `${say('contact')}: ${report.email ?? say('noContact')}`,
    `${say('view')}: ${report.view ?? say('noView')}`,
    `${say('browser')}: ${meta.userAgent ? clean(meta.userAgent).slice(0, 300) : say('noBrowser')}`,
    '',
    report.message,
  ];
  return { subject: say('subject', { app: form.app.name, category }), text: lines.join('\n') };
}

/** SMTP mailer from the environment, or undefined when the form is not configured. */
export function mailerFromEnv(form: ReportForm, env: NodeJS.ProcessEnv = process.env): Mailer | undefined {
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
      const { subject, text } = formatReport(report, meta, form);
      await transport.sendMail({ from: REPORT_FROM ?? SMTP_USER, to: REPORT_TO, replyTo: report.email, subject, text });
    },
  };
}
