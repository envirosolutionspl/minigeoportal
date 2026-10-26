import { t } from '@/i18n';

/** Said after the text of a link that opens in a new tab, for screen readers (WCAG G201). */
export function NewTab() {
  return <span className="sr-only"> {t('common.newTab')}</span>;
}
