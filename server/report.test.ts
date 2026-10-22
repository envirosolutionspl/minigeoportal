import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { RequestError } from './http.ts';
import { formatReport, mailerFromEnv, parseReport, type Mailer } from './report.ts';
import type { CapabilitiesCache } from '../src/services/meta.ts';
import { defaults, site } from './testSite.ts';

const ORIGIN = 'https://prostygeoportal.pl';
const valid = { category: 'mapa', message: 'Warstwa działek się nie wczytuje.', email: 'jan@example.com', view: `${ORIGIN}/?x=1&y=2&z=3` };

describe('parseReport', () => {
  it('accepts a valid report and keeps a link to the app', () => {
    expect(parseReport(valid, ORIGIN, defaults)).toEqual(valid);
  });

  it('drops links to other sites and control characters, keeps line breaks', () => {
    const r = parseReport({ ...valid, view: 'https://evil.example/x', message: 'Linia 1\nLinia\u0000 2\u0007' }, ORIGIN, defaults);
    expect(r).toEqual({ category: 'mapa', message: 'Linia 1\nLinia 2', email: 'jan@example.com', view: undefined });
  });

  it('rejects unknown categories, too short or long messages and bad e-mails', () => {
    expect(() => parseReport({ ...valid, category: 'toString' }, ORIGIN, defaults)).toThrow(RequestError);
    expect(() => parseReport({ ...valid, message: 'krótko' }, ORIGIN, defaults)).toThrow(/od 10 do 3000/);
    expect(() => parseReport({ ...valid, message: 'x'.repeat(3001) }, ORIGIN, defaults)).toThrow(RequestError);
    expect(() => parseReport({ ...valid, email: 'a@b\nBcc: x@y.pl' }, ORIGIN, defaults)).toThrow(/e-mail/);
    expect(() => parseReport(null, ORIGIN, defaults)).toThrow(RequestError);
    expect(parseReport({ ...valid, email: '  ' }, ORIGIN, defaults)?.email).toBeUndefined();
  });

  it('silently ignores reports with the hidden field filled in', () => {
    expect(parseReport({ ...valid, website: 'http://spam' }, ORIGIN, defaults)).toBeNull();
  });
});

describe('formatReport', () => {
  it('writes a plain-text mail with a fixed subject', () => {
    const { subject, text } = formatReport(parseReport(valid, ORIGIN, defaults)!, { userAgent: 'Chrome' }, defaults);
    expect(subject).toBe('[Prosty Geoportal] Zgłoszenie: Mapa lub warstwy');
    expect(text).toContain('Kontakt: jan@example.com');
    expect(text).toContain(`Widok mapy: ${valid.view}`);
    expect(text).toContain('Przeglądarka: Chrome');
    expect(text.endsWith(valid.message)).toBe(true);
  });
});

describe('mailerFromEnv', () => {
  it('is off without a mail server or recipient', () => {
    expect(mailerFromEnv(defaults, {})).toBeUndefined();
    expect(mailerFromEnv(defaults, { SMTP_HOST: 'smtp.example.com' })).toBeUndefined();
    expect(mailerFromEnv(defaults, { SMTP_HOST: 'smtp.example.com', REPORT_TO: 'a@example.com' })).toBeDefined();
  });
});

describe('POST /api/report', () => {
  const CACHE: CapabilitiesCache = { generatedAt: 'x', services: {} };
  const remote = { incoming: { socket: { remoteAddress: '203.0.113.9', remoteFamily: 'IPv4', remotePort: 1 } } };
  const post = (app: ReturnType<typeof createApp>, body: unknown, headers: Record<string, string> = {}) =>
    app.request(
      '/api/report',
      {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(body),
        headers: { 'content-type': 'application/json', ...headers },
      },
      remote,
    );

  it('sends a valid report and says whether the form is on', async () => {
    const send = vi.fn<Mailer['send']>(async () => {});
    const app = createApp({ site, cache: CACHE, refresh: async () => CACHE, mailer: { send }, origin: ORIGIN });
    expect(await (await app.request('/api/report', {}, remote)).json()).toEqual({ enabled: true });
    const res = await post(app, valid, { 'user-agent': 'Test' });
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledWith(valid, { userAgent: 'Test' });
  });

  it('answers 400 for invalid input, 503 when off, 502 when mail fails, 413 for big bodies', async () => {
    const failing = createApp({
      site,
      cache: CACHE,
      refresh: async () => CACHE,
      mailer: {
        send: async () => {
          throw new Error('smtp down');
        },
      },
      origin: ORIGIN,
    });
    expect((await post(failing, { ...valid, category: 'x' })).status).toBe(400);
    expect((await post(failing, 'not json')).status).toBe(400);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await post(failing, valid)).status).toBe(502);
    const off = createApp({ site, cache: CACHE, refresh: async () => CACHE });
    expect((await post(off, valid)).status).toBe(503);
    expect(await (await off.request('/api/report', {}, remote)).json()).toEqual({ enabled: false });
    const big = createApp({
      site,
      cache: CACHE,
      refresh: async () => CACHE,
      mailer: { send: async () => {} },
      limits: { dict: [1, 1], featureInfo: [1, 1], report: [10, 60] },
    });
    expect((await post(big, { ...valid, message: 'x'.repeat(20000) })).status).toBe(413);
  });

  it('limits reports per visitor', async () => {
    const send = vi.fn<Mailer['send']>(async () => {});
    const app = createApp({
      site,
      cache: CACHE,
      refresh: async () => CACHE,
      mailer: { send },
      origin: ORIGIN,
      limits: { dict: [1, 1], featureInfo: [1, 1], report: [2, 0.1] },
    });
    expect((await post(app, valid)).status).toBe(200);
    expect((await post(app, valid)).status).toBe(200);
    expect((await post(app, valid)).status).toBe(429);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
