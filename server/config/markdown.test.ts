import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.ts';

describe('renderMarkdown', () => {
  it('renders headings, lists, quotes and emphasis', () => {
    expect(renderMarkdown('## Skąd są dane\n\n- **jeden**\n- dwa\n\n> Ważne')).toBe(
      '<h2>Skąd są dane</h2>\n<ul>\n<li><strong>jeden</strong></li>\n<li>dwa</li>\n</ul>\n<blockquote>\n<p>Ważne</p>\n</blockquote>\n',
    );
  });

  it('opens web links in a new tab, keeps mail links and turns app links into actions', () => {
    const html = renderMarkdown('[geoportal](https://www.geoportal.gov.pl), [poczta](mailto:a@b.pl), [formularz](app:report)');
    expect(html).toContain('<a href="https://www.geoportal.gov.pl" target="_blank" rel="noopener">geoportal</a>');
    expect(html).toContain('<a href="mailto:a@b.pl">poczta</a>');
    expect(html).toContain('<a href="#report" data-action="report">formularz</a>');
    expect(renderMarkdown('[podróż w czasie](app:time)')).toContain('<a href="#time" data-action="time">podróż w czasie</a>');
  });

  it('shows raw HTML as text and drops links and images it does not trust', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script>\n\n[x](javascript:alert(1)) [y](app:delete) ![obraz](https://a.b/c.png) <b>b</b>',
    );
    expect(html).not.toMatch(/<script|<b>|<img|javascript:|href="#delete"/);
    expect(html).toContain('&lt;script&gt;');
  });
});
