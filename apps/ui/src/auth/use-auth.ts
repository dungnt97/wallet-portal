// Hook to consume AuthContext — throws if used outside AuthProvider
import { useContext } from 'react';
import { AuthContext } from './auth-provider';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
