import { vi } from 'vitest';
import {
  applyResolvedTheme,
  getStoredThemePreference,
  getSystemTheme,
  resolveTheme,
  saveThemePreference,
  subscribeToSystemTheme,
  THEME_COLORS,
  THEME_STORAGE_KEY,
} from '../theme';

describe('theme helpers', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = '';
    document.head.innerHTML = '';
    window.matchMedia = originalMatchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it('reads stored theme preference with auto fallback and error safety', () => {
    expect(getStoredThemePreference()).toBe('auto');

    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(getStoredThemePreference()).toBe('dark');

    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(getStoredThemePreference()).toBe('light');

    window.localStorage.setItem(THEME_STORAGE_KEY, 'auto');
    expect(getStoredThemePreference()).toBe('auto');

    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(getStoredThemePreference()).toBe('auto');

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(getStoredThemePreference()).toBe('auto');
  });

  it('saves theme preference and ignores storage errors', () => {
    saveThemePreference('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => saveThemePreference('dark')).not.toThrow();
  });

  it('detects system theme via matchMedia and defaults to light when unavailable', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(getSystemTheme()).toBe('light');

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    expect(getSystemTheme()).toBe('dark');

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    expect(getSystemTheme()).toBe('light');
  });

  it('resolves auto vs explicit dark/light preferences', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    expect(resolveTheme('auto')).toBe('dark');
    expect(resolveTheme('auto', 'light')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
    expect(resolveTheme('light', 'dark')).toBe('light');
  });

  it('applies resolved theme to document root and meta theme-color when present', () => {
    applyResolvedTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#000000';
    document.head.appendChild(meta);

    applyResolvedTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(meta.getAttribute('content')).toBe(THEME_COLORS.light);
  });

  it('subscribes to and unsubscribes from system theme changes safely', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const noopUnsubscribe = subscribeToSystemTheme(vi.fn());
    expect(() => noopUnsubscribe()).not.toThrow();

    let changeHandler: ((event: MediaQueryListEvent) => void) | undefined;
    const addEventListener = vi.fn(
      (_event: string, cb: (event: MediaQueryListEvent) => void) => {
        changeHandler = cb;
      },
    );
    const removeEventListener = vi.fn();

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener,
        removeEventListener,
      }),
    });

    const listener = vi.fn();
    const unsubscribe = subscribeToSystemTheme(listener);
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    changeHandler?.({ matches: true } as MediaQueryListEvent);
    changeHandler?.({ matches: false } as MediaQueryListEvent);
    expect(listener).toHaveBeenNthCalledWith(1, 'dark');
    expect(listener).toHaveBeenNthCalledWith(2, 'light');

    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
  });
});
