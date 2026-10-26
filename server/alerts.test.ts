import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alertsTo, critical } from './alerts.ts';
import type { Mailer } from './report.ts';
import { site } from './testSite.ts';

describe('critical', () => {
  const alert = vi.fn<Mailer['alert']>(async () => {});
  const mailer: Mailer = { send: async () => {}, alert };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    alert.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    alertsTo(undefined, site.mail);
  });

  it('logs the error and mails it to the administrator in the language of the report mails', async () => {
    alertsTo(mailer, site.mail);
    await critical('Data refresh failed', new Error('disk full'));
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/^CRITICAL Data refresh failed: Error: disk full/));
    const [subject, text] = alert.mock.calls[0];
    // The configuration writes the report mails in Polish.
    expect(subject).toBe(`[${site.mail.app.name}] Błąd krytyczny: Data refresh failed`);
    expect(text).toMatch(/^Serwer: .+\nCzas: \d{4}-.+\n\nData refresh failed\n\nError: disk full/);
  });

  it('mails the same error once a day and no more than ten a day in all', async () => {
    alertsTo(mailer, site.mail);
    await critical('kieg: HTTP 503');
    await critical('kieg: HTTP 503');
    expect(alert).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 20; i++) await critical(`service ${i}: timeout`);
    expect(alert).toHaveBeenCalledTimes(10);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    await critical('kieg: HTTP 503');
    expect(alert).toHaveBeenCalledTimes(11);
  });

  it('only logs without a mailer, and a failed mail is logged, not thrown', async () => {
    await critical('Uncaught exception', new Error('boom'));
    expect(alert).not.toHaveBeenCalled();
    alertsTo({ send: async () => {}, alert: async () => Promise.reject(new Error('SMTP down')) }, site.mail);
    await expect(critical('Uncaught exception', new Error('boom'))).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('alert mail: SMTP down');
  });
});
