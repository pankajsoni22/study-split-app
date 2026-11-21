import { Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { getTheme, setTheme, type Theme } from '../lib/theme.ts';

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon }
];

/** System / Light / Dark. Saved in this browser only (no server call). */
export default function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const [theme, setLocal] = useState<Theme>(getTheme);
  return (
    <div className="segmented" role="group" aria-label="Theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button key={value} type="button" aria-pressed={theme === value} title={label}
          onClick={() => { setTheme(value); setLocal(value); }}>
          <Icon size={15} aria-hidden="true" />{compact ? <span className="visually-hidden">{label}</span> : label}
        </button>
      ))}
    </div>
  );
}
