import { renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth-provider';
import { useAuth } from '../use-auth';

describe('useAuth hook', () => {
  it('returns auth context when used inside AuthProvider', () => {
    const mockAuthValue = {
      user: { id: '123', email: 'test@example.com' },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    };

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
    const mockAuthValue = {
      user: { id: '456', email: 'admin@example.com', roles: ['admin'] },
      isAuthenticated: true,
      permissions: ['read', 'write', 'delete'],
      login: vi.fn(),
      logout: vi.fn(),
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={mockAuthValue}>{children}</AuthContext.Provider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user.email).toBe('admin@example.com');
  });
});
