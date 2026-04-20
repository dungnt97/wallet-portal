// Route guard — redirects to /login if no authenticated staff
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './use-auth';

export function LoginGate() {
  const { staff, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg)]">
        <div className="text-[var(--text-muted)] text-sm animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!staff) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
