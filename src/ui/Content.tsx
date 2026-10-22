import type { MouseEvent } from 'react';

/** Actions a link in a text may start: [report form](app:report) (server/config/markdown.ts). */
export type ContentAction = 'report' | 'accessibility' | 'welcome';

/**
 * A text of the deployment (config/content), as HTML the server made from Markdown: escaped,
 * with links only to web and e-mail addresses and to the app's own actions.
 */
export function Content({ html, onAction }: { html: string; onAction: (action: ContentAction) => void }) {
  const click = (e: MouseEvent<HTMLDivElement>) => {
    const link = (e.target as Element).closest<HTMLAnchorElement>('a[data-action]');
    if (!link) return;
    e.preventDefault();
    onAction(link.dataset.action as ContentAction);
  };
  // The links inside are real links: keyboard activation arrives here as their click.
  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
  return <div className="content" onClick={click} dangerouslySetInnerHTML={{ __html: html }} />;
}
