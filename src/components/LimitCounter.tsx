import { limitState } from '@/lib/editorLimits';

const numberFormat = new Intl.NumberFormat('en-US');
const format = (value: number) => numberFormat.format(value);

export default function LimitCounter({ count, limit, label, unit = 'characters', showUnit = false, className = '' }: {
  count: number;
  limit: number;
  label: string;
  unit?: string;
  showUnit?: boolean;
  className?: string;
}) {
  const state = limitState(count, limit);
  const remaining = limit - count;
  const status = remaining < 0 ? `${format(-remaining)} over the limit` : remaining === 0 ? 'At the limit' : `${format(remaining)} remaining`;
  const description = `${label}: ${format(count)} of ${format(limit)} ${unit}. ${status}.`;
  return <span className={`char-counter limit-counter ${state === 'normal' ? '' : state} ${className}`.trim()}
    data-limit-state={state} aria-label={description} title={description}>
    {format(count)} / {format(limit)}{showUnit && ` ${unit}`}
  </span>;
}
