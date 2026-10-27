import { X } from 'lucide-react';
import { t } from '@/i18n';

/** The X that closes a panel or window: 36 px among other controls, a fingertip (44 px) on a phone. */
export function CloseButton({
  onClick,
  label = t('common.close'),
  className = '',
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-[var(--hover)] phone:h-11 phone:w-11 ${className}`}
    >
      <X className="h-5 w-5" />
    </button>
  );
}
