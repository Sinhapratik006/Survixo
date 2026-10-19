import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand-700 dark:text-slate-400 dark:hover:bg-navy-700 dark:hover:text-white"
      aria-label={`Theme: ${theme}. Switch to ${next}`}
      title={`Theme: ${theme}`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}
