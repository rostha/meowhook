'use client';

export default function ComponentOptionCheck({ label, ariaLabel, checked, onChange }: {
  label: string;
  ariaLabel?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <label className="component-option-check">
    <input type="checkbox" aria-label={ariaLabel ?? label} checked={checked} onChange={event => onChange(event.target.checked)} />
    <span>{label}</span>
  </label>;
}
