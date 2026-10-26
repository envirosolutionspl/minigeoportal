import { hostname } from 'node:os';
import { errorMessage } from './config.ts';
import type { Mailer, ReportForm } from './report.ts';

/**
 * Critical errors of the server: written to the log and sent by e-mail to the administrator
 * (app.yaml admin), with the mail server of the bug reports. The same error goes out at most once
 * a day and no more than ten a day in all, so a failing service cannot flood the mailbox.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_A_DAY = 10;

let mail: ((what: string, detail: string) => Promise<void>) | undefined;
/** The errors mailed within the last day, by their first line. */
const sent = new Map<string, number>();

/** Mails the critical errors from now on; without a mailer they only go to the log. */
export function alertsTo(mailer: Mailer | undefined, form: ReportForm): void {
  sent.clear();
  if (!mailer) {
    mail = undefined;
    return;
  }
  const say = (key: string, params: Record<string, string> = {}) =>
    String(form.messages[`report.mail.${key}`] ?? key).replace(/\{(\w+)\}/g, (all, name: string) => params[name] ?? all);
  mail = (what, detail) =>
    mailer.alert(
      say('alert', { app: form.app.name, what }),
      [`${say('server')}: ${hostname()}`, `${say('time')}: ${new Date().toISOString()}`, '', what, ...(detail ? ['', detail] : [])].join(
        '\n',
      ),
    );
}

export async function critical(what: string, error?: unknown): Promise<void> {
  const detail = error === undefined ? '' : error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`CRITICAL ${what}${detail ? `: ${detail}` : ''}`);
  if (!mail) return;
  const now = Date.now();
  for (const [key, at] of sent) if (now - at >= DAY_MS) sent.delete(key);
  const key = `${what}\n${detail.split('\n')[0]}`;
  if (sent.has(key) || sent.size >= MAX_A_DAY) return;
  sent.set(key, now);
  await mail(what, detail).catch((e: unknown) => console.error(`alert mail: ${errorMessage(e)}`));
}

/**
 * An error nothing caught leaves the process in an unknown state: it is mailed (given a few
 * seconds), then the process stops, as Node would without this, and the service manager starts it again.
 */
export function alertOnCrash(): void {
  const crash = (what: string) => (e: unknown) => {
    setTimeout(() => process.exit(1), 5000).unref();
    void critical(what, e).finally(() => process.exit(1));
  };
  process.on('uncaughtException', crash('Uncaught exception'));
  process.on('unhandledRejection', crash('Unhandled promise rejection'));
}
