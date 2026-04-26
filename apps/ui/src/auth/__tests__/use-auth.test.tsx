import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth-provider';
import { useAuth } from '../use-auth';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAuthValue(overrides: Record<string, unknown> = {}) {
  return {
    staff: null,
    loading: false,
    initiateLogin: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    hasPerm: vi.fn(() => false),
    ...overrides,
  };
}

describe('useAuth hook', () => {
  it('returns auth context when used inside AuthProvider', () => {
    const mockAuthValue = makeAuthValue({
      staff: {
        id: '123',
        email: 'test@example.com',
        name: 'Test',
        role: 'admin' as const,
        initials: 'T',
      },
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={mockAuthValue}>{children}</AuthContext.Provider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current).toEqual(mockAuthValue);
  });

  it('throws error when used outside AuthProvider', () => {
    // Suppress console.error for this test since we expect an error
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used inside <AuthProvider>');

    consoleErrorSpy.mockRestore();
  });

  it('provides access to authentication state', () => {
    const mockAuthValue = makeAuthValue({
      staff: {
        id: '456',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin' as const,
        initials: 'A',
      },
      hasPerm: vi.fn(() => true),
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={mockAuthValue}>{children}</AuthContext.Provider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.staff?.email).toBe('admin@example.com');
    expect(result.current.hasPerm('withdrawal.create')).toBe(true);
  });
});
