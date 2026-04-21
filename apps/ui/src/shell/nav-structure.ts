// Nav structure — sidebar groups + items. Ports prototype shell.jsx `NAV`.
// Labels are i18n keys resolved at render via `t()`.
// Live badge counts come from useSidebarCounts() (GET /dashboard/nav-counts, 30s poll).
// The `badge` field here is intentionally removed — sidebar.tsx resolves counts dynamically.
import type { IconKey } from '@/icons';

export interface NavItem {
  id: string;
  to: string;
  labelKey: string;
  iconKey: IconKey;
  badge?: string;
  badgeKind?: 'warn' | 'err';
}

export interface NavGroup {
  section: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    section: 'overview',
    items: [
      {
        id: 'dashboard',
        to: '/app/dashboard',
        labelKey: 'sidebar.dashboard',
        iconKey: 'Dashboard',
      },
    ],
  },
  {
    section: 'flows',
    items: [
      {
        id: 'deposits',
        to: '/app/deposits',
        labelKey: 'sidebar.deposits',
        iconKey: 'ArrowDown',
      },
      { id: 'sweep', to: '/app/sweep', labelKey: 'sidebar.sweep', iconKey: 'Sweep' },
      {
        id: 'withdrawals',
        to: '/app/withdrawals',
        labelKey: 'sidebar.withdrawals',
        iconKey: 'ArrowUp',
        badgeKind: 'warn',
      },
      { id: 'cold', to: '/app/cold', labelKey: 'sidebar.cold', iconKey: 'Database' },
    ],
  },
  {
    section: 'queue',
    items: [
      {
        id: 'multisig',
        to: '/app/multisig',
        labelKey: 'sidebar.multisig',
        iconKey: 'Shield',
        badgeKind: 'warn',
      },
      {
        id: 'recovery',
        to: '/app/recovery',
        labelKey: 'sidebar.failedTxs',
        iconKey: 'AlertTri',
        badgeKind: 'err',
      },
    ],
  },
  {
    section: 'records',
    items: [
      { id: 'users', to: '/app/users', labelKey: 'sidebar.users', iconKey: 'Users' },
      {
        id: 'transactions',
        to: '/app/transactions',
        labelKey: 'sidebar.transactions',
        iconKey: 'Activity',
      },
      { id: 'recon', to: '/app/recon', labelKey: 'sidebar.recon', iconKey: 'Check' },
      { id: 'audit', to: '/app/audit', labelKey: 'sidebar.audit', iconKey: 'Logs' },
    ],
  },
  {
    section: 'admin',
    items: [
      { id: 'signers', to: '/app/signers', labelKey: 'sidebar.signers', iconKey: 'Key' },
      { id: 'notifs', to: '/app/notifs', labelKey: 'sidebar.notifs', iconKey: 'Bell' },
      {
        id: 'architecture',
        to: '/app/architecture',
        labelKey: 'sidebar.architecture',
        iconKey: 'Network',
      },
    ],
  },
];

// Page title lookup used by the topbar breadcrumb.
export function pageTitleKey(segment: string): string {
  return `pageTitles.${segment}`;
}
