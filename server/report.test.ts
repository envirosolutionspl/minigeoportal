import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { RequestError } from './http.ts';
import { formatReport, mailerFromEnv, parseReport, type Mailer } from './report.ts';
import type { CapabilitiesCache } from '../src/services/meta.ts';
import { defaults, site } from './testSite.ts';

const ORIGIN = `https://${defaults.app.domain}`;
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
    expect(() => parseReport({ ...valid, message: 'krótko' }, ORIGIN, defaults)).toThrow(/10 to 3000/);
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
  it('writes a plain-text mail with a fixed subject, in the language of report mails (report.locale: pl)', () => {
    const { subject, text } = formatReport(parseReport(valid, ORIGIN, site.mail)!, { userAgent: 'Chrome' }, site.mail);
    expect(subject).toBe(`[${site.mail.app.name}] Zgłoszenie: Mapa lub warstwy`);
    expect(text).toContain('Kontakt: jan@example.com');
    expect(text).toContain(`Widok mapy: ${valid.view}`);
    expect(text).toContain('Przeglądarka: Chrome');
    expect(text.endsWith(valid.message)).toBe(true);
  });
});

describe('formatReport in another language', () => {
  it('takes the texts of the mail from that language', () => {
    const { subject, text } = formatReport(parseReport(valid, ORIGIN, defaults)!, {}, defaults);
    expect(subject).toBe(`[${defaults.app.name}] Report: Map or layers`);
    expect(text).toContain('Browser: unknown');
  });
});

describe('mailerFromEnv', () => {
  it('is off without a mail server, the administrator or a sender address', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(mailerFromEnv(defaults, undefined, { SMTP_HOST: 'smtp.example.com', SMTP_USER: 'u@example.com' })).toBeUndefined();
    expect(mailerFromEnv(defaults, 'a@example.com', {})).toBeUndefined();
    // Without a sender every send would fail later: said at start instead.
    expect(mailerFromEnv(defaults, 'a@example.com', { SMTP_HOST: 'smtp.example.com' })).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('REPORT_FROM'));
    expect(mailerFromEnv(defaults, 'a@example.com', { SMTP_HOST: 'smtp.example.com', SMTP_USER: 'u@example.com' })).toBeDefined();
    expect(mailerFromEnv(defaults, 'a@example.com', { SMTP_HOST: 'smtp.example.com', REPORT_FROM: 'App <a@b.pl>' })).toBeDefined();
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
    const app = createApp({ site, cache: () => CACHE, mailer: { send }, origin: ORIGIN });
    expect(await (await app.request('/api/report', {}, remote)).json()).toEqual({ enabled: true });
    const res = await post(app, valid, { 'user-agent': 'Test' });
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledWith(valid, { userAgent: 'Test' });
  });

  it('takes reports only from the app’s own page: JSON, and no other site in Sec-Fetch-Site', async () => {
    const send = vi.fn<Mailer['send']>(async () => {});
    const app = createApp({
      site,
      cache: () => CACHE,
      mailer: { send },
      origin: ORIGIN,
      limits: { dict: [1, 1], featureInfo: [1, 1], report: [20, 60] },
    });
    // A form on another site can post only text/plain, form-urlencoded or multipart without a preflight.
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
      expect((await post(app, valid, { 'content-type': type })).status).toBe(403);
    }
    expect((await post(app, valid, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post(app, valid, { 'sec-fetch-site': 'same-site' })).status).toBe(403);
    expect(send).not.toHaveBeenCalled();
    // The page itself, a typed request (none) and clients that send no such header pass.
    for (const from of ['same-origin', 'none']) expect((await post(app, valid, { 'sec-fetch-site': from })).status).toBe(200);
    expect((await post(app, valid, { 'content-type': 'application/json; charset=utf-8' })).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('links to the map view only in the app’s own address; without APP_ORIGIN only from the machine itself', async () => {
    const send = vi.fn<Mailer['send']>(async () => {});
    const limits: { dict: [number, number]; featureInfo: [number, number]; report: [number, number] } = {
      dict: [1, 1],
      featureInfo: [1, 1],
      report: [20, 60],
    };
    const bare = createApp({ site, cache: () => CACHE, mailer: { send }, limits });
    // From the internet the page's Origin proves nothing: the link is dropped.
    await post(bare, valid, { origin: ORIGIN });
    expect(send.mock.lastCall![0].view).toBeUndefined();
    // In development, from the same machine, the page's own Origin stands in for APP_ORIGIN.
    await bare.request(
      '/api/report',
      { method: 'POST', body: JSON.stringify(valid), headers: { 'content-type': 'application/json', origin: ORIGIN } },
      { incoming: { socket: { remoteAddress: '127.0.0.1', remoteFamily: 'IPv4', remotePort: 1 } } },
    );
    expect(send.mock.lastCall![0].view).toBe(valid.view);
  });

  it('answers 400 for invalid input, 503 when off, 502 when mail fails, 413 for big bodies', async () => {
    const failing = createApp({
      site,
      cache: () => CACHE,
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
    const off = createApp({ site, cache: () => CACHE });
    expect((await post(off, valid)).status).toBe(503);
    expect(await (await off.request('/api/report', {}, remote)).json()).toEqual({ enabled: false });
    const big = createApp({
      site,
      cache: () => CACHE,
      mailer: { send: async () => {} },
      limits: { dict: [1, 1], featureInfo: [1, 1], report: [10, 60] },
    });
    expect((await post(big, { ...valid, message: 'x'.repeat(20000) })).status).toBe(413);
  });

  it('limits reports per visitor', async () => {
    const send = vi.fn<Mailer['send']>(async () => {});
    const app = createApp({
      site,
      cache: () => CACHE,
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
