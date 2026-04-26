import { beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeLang, useTweaksStore } from '../tweaks-store';

// Prevent zustand persist from touching real localStorage
vi.mock('zustand/middleware', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zustand/middleware')>();
  // biome-ignore lint/suspicious/noExplicitAny: zustand persist stub in tests
  return { ...actual, persist: (fn: any) => fn };
});

function getStore() {
  return useTweaksStore.getState();
}

describe('useTweaksStore', () => {
  beforeEach(() => {
    // Reset to defaults before each test
    useTweaksStore.setState({
      theme: 'light',
      density: 'comfortable',
      accent: 'indigo',
      typography: 'mono',
      lang: 'en',
      sidebarCollapsed: false,
      showRiskFlags: true,
    });
    vi.clearAllMocks();
  });

  it('has default values', () => {
    const s = getStore();
    expect(s.theme).toBe('light');
    expect(s.density).toBe('comfortable');
    expect(s.accent).toBe('indigo');
    expect(s.typography).toBe('mono');
    expect(s.sidebarCollapsed).toBe(false);
    expect(s.showRiskFlags).toBe(true);
  });

  it('setTheme updates theme', () => {
    getStore().setTheme('dark');
    expect(getStore().theme).toBe('dark');
  });

  it('setDensity updates density', () => {
    getStore().setDensity('compact');
    expect(getStore().density).toBe('compact');
  });

  it('setDensity to cozy', () => {
    getStore().setDensity('cozy');
    expect(getStore().density).toBe('cozy');
  });

  it('setAccent updates accent', () => {
    getStore().setAccent('emerald');
    expect(getStore().accent).toBe('emerald');
  });

  it('setTypography updates typography', () => {
    getStore().setTypography('sans');
    expect(getStore().typography).toBe('sans');
  });

  it('setLang updates lang', () => {
    getStore().setLang('vi');
    expect(getStore().lang).toBe('vi');
  });

  it('setSidebarCollapsed updates sidebarCollapsed', () => {
    getStore().setSidebarCollapsed(true);
    expect(getStore().sidebarCollapsed).toBe(true);
  });

  it('setShowRiskFlags updates showRiskFlags', () => {
    getStore().setShowRiskFlags(false);
    expect(getStore().showRiskFlags).toBe(false);
  });

  it('toggleTheme from light → dark', () => {
    useTweaksStore.setState({ theme: 'light' });
    getStore().toggleTheme();
    expect(getStore().theme).toBe('dark');
  });

  it('toggleTheme from dark → light', () => {
    useTweaksStore.setState({ theme: 'dark' });
    getStore().toggleTheme();
    expect(getStore().theme).toBe('light');
  });

  it('toggleLang from en → vi', () => {
    useTweaksStore.setState({ lang: 'en' });
    getStore().toggleLang();
    expect(getStore().lang).toBe('vi');
  });

  it('toggleLang from vi → en', () => {
    useTweaksStore.setState({ lang: 'vi' });
    getStore().toggleLang();
    expect(getStore().lang).toBe('en');
  });

  it('toggleSidebarCollapsed from false → true', () => {
    useTweaksStore.setState({ sidebarCollapsed: false });
    getStore().toggleSidebarCollapsed();
    expect(getStore().sidebarCollapsed).toBe(true);
  });

  it('toggleSidebarCollapsed from true → false', () => {
    useTweaksStore.setState({ sidebarCollapsed: true });
    getStore().toggleSidebarCollapsed();
    expect(getStore().sidebarCollapsed).toBe(false);
  });

  it('setLang notifies lang listeners', () => {
    const listener = vi.fn();
    const unsub = subscribeLang(listener);
    getStore().setLang('vi');
    expect(listener).toHaveBeenCalledWith('vi');
    unsub();
  });

  it('subscribeLang returns unsubscribe function', () => {
    const listener = vi.fn();
    const unsub = subscribeLang(listener);
    unsub();
    getStore().setLang('en');
    // After unsub, listener should not be called
    expect(listener).not.toHaveBeenCalled();
  });

  it('setTheme applies data-theme to document', () => {
    getStore().setTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('setDensity applies data-density to document', () => {
    getStore().setDensity('compact');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
  });

  it('setAccent applies data-accent to document', () => {
    getStore().setAccent('rose');
    expect(document.documentElement.getAttribute('data-accent')).toBe('rose');
  });

  it('setTypography applies data-typography to document', () => {
    getStore().setTypography('sans');
    expect(document.documentElement.getAttribute('data-typography')).toBe('sans');
  });
});
