import { Marked, type Tokens } from 'marked';

/**
 * Texts of the deployment (welcome, accessibility statement) in Markdown, turned into HTML once
 * when the server starts. HTML written into the Markdown is shown as text, not run; links may lead
 * to http(s) and mailto addresses, or to an action of the app: [report form](app:report).
 */

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Actions a link may start in the app (src/ui/Content.tsx). */
export const APP_ACTIONS = new Set(['report', 'accessibility', 'welcome']);

const markdown = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escapeHtml(text),
    link({ href, tokens }: Tokens.Link) {
      const label = this.parser.parseInline(tokens);
      const action = /^app:([a-z]+)$/.exec(href)?.[1];
      if (action && APP_ACTIONS.has(action)) return `<a href="#${action}" data-action="${action}">${label}</a>`;
      if (/^mailto:[^\s"<>]+$/.test(href)) return `<a href="${escapeHtml(href)}">${label}</a>`;
      if (/^https?:\/\/[^\s"<>]+$/.test(href)) return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${label}</a>`;
      return label;
    },
    image: ({ text }: Tokens.Image) => escapeHtml(text),
  },
});

export function renderMarkdown(source: string): string {
  return markdown.parse(source, { async: false });
}
