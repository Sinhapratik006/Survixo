import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';
interface ThemeCtx {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const KEY = 'nx_theme';

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => (typeof localStorage !== 'undefined' ? (localStorage.getItem(KEY) as Theme | null) : null) ?? 'system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const apply = () => {
      const r = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
      setResolved(r);
      document.documentElement.classList.toggle('dark', r === 'dark');
    };
    apply();
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(KEY, t);
    setThemeState(t);
  }, []);

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
