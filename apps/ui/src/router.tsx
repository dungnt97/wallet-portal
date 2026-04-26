import { LoginGate } from '@/auth/login-gate';
import { ArchitecturePage } from '@/features/architecture/architecture-page';
import { AuditPage } from '@/features/audit/audit-page';
import { AuthCallbackPage } from '@/features/auth/auth-callback-page';
import { SecurityPage } from '@/features/auth/security-page';
import { ColdPage } from '@/features/cold/cold-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { DepositsPage } from '@/features/deposits/deposits-page';
import { LoginPage } from '@/features/login/login-page';
import { MultisigPage } from '@/features/multisig/multisig-page';
import { NotifsPage } from '@/features/notifs/notifs-page';
import { OpsPage } from '@/features/ops/ops-page';
import { ReconPage } from '@/features/recon/recon-page';
import { RecoveryPage } from '@/features/recovery/recovery-page';
import { SignersPage } from '@/features/signers/signers-page';
import { SweepPage } from '@/features/sweep/sweep-page';
import { TransactionsPage } from '@/features/transactions/transactions-page';
import { UsersPage } from '@/features/users/users-page';
import { WithdrawalsPage } from '@/features/withdrawals/withdrawals-page';
import { AppLayout } from '@/shell/app-layout';
// React Router 6 — createBrowserRouter with protected /app/* routes
import { Navigate, createBrowserRouter } from 'react-router-dom';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  // OIDC callback — Google redirects here after consent
  {
    path: '/auth/callback',
    element: <AuthCallbackPage />,
  },
  {
    path: '/app',
    element: <LoginGate />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'deposits', element: <DepositsPage /> },
          { path: 'sweep', element: <SweepPage /> },
          { path: 'withdrawals', element: <WithdrawalsPage /> },
          { path: 'withdrawals/:id', element: <Navigate to="/app/withdrawals" replace /> },
          { path: 'cold', element: <ColdPage /> },
          { path: 'multisig', element: <MultisigPage /> },
          { path: 'recovery', element: <RecoveryPage /> },
          { path: 'users', element: <UsersPage /> },
          { path: 'transactions', element: <TransactionsPage /> },
          { path: 'recon', element: <ReconPage /> },
          { path: 'audit', element: <AuditPage /> },
          { path: 'signers', element: <SignersPage /> },
          { path: 'notifs', element: <NotifsPage /> },
          { path: 'architecture', element: <ArchitecturePage /> },
          { path: 'ops', element: <OpsPage /> },
          { path: 'account/security', element: <SecurityPage /> },
          { path: '*', element: <Navigate to="dashboard" replace /> },
        ],
      },
    ],
  },
  // Catch-all → redirect to /login (LoginGate will forward to /app after auth)
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);
