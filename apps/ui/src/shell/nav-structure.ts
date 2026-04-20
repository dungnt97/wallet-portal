// Nav structure — sidebar groups + items. Ports prototype shell.jsx `NAV`.
// Labels are i18n keys resolved at render via `t()`. Badges/counts are
// placeholders until the dashboard summary endpoint wires them up.
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
        badge: '4',
      },
      { id: 'sweep', to: '/app/sweep', labelKey: 'sidebar.sweep', iconKey: 'Sweep', badge: '12' },
      {
        id: 'withdrawals',
        to: '/app/withdrawals',
        labelKey: 'sidebar.withdrawals',
        iconKey: 'ArrowUp',
        badge: '3',
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
        badge: '5',
        badgeKind: 'warn',
      },
      {
        id: 'recovery',
        to: '/app/recovery',
        labelKey: 'sidebar.failedTxs',
        iconKey: 'AlertTri',
        badge: '4',
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
