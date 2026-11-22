export type ThemePreference = 'auto' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'rdr2-prdr-theme';

export const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: '#0b0a09',
  light: '#efe3cc',
};

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === 'auto' || value === 'dark' || value === 'light';

export const getStoredThemePreference = (): ThemePreference => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
};

export const saveThemePreference = (preference: ThemePreference): void => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignore storage errors in restricted browsing contexts
  }
};

export const getSystemTheme = (): ResolvedTheme =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

export const resolveTheme = (
  preference: ThemePreference,
  systemTheme: ResolvedTheme = getSystemTheme(),
): ResolvedTheme => (preference === 'auto' ? systemTheme : preference);

export const applyResolvedTheme = (resolved: ResolvedTheme): void => {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', THEME_COLORS[resolved]);
  }
};

export const subscribeToSystemTheme = (
  onChange: (theme: ResolvedTheme) => void,
): (() => void) => {
  if (typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (event: MediaQueryListEvent) => {
    onChange(event.matches ? 'dark' : 'light');
  };
  mediaQuery.addEventListener('change', handler);
  return () => {
    mediaQuery.removeEventListener('change', handler);
  };
};
