// Sidebar nav — ported from prototype shell.jsx NAV structure
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, ArrowDownToLine, Shuffle, ArrowUpFromLine,
  Database, Shield, AlertTriangle, Users, Activity,
  CheckSquare, ScrollText, Key, Bell, Network, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavStore } from '@/stores/nav-store';
import { useAuth } from '@/auth/use-auth';
import { ROLES } from '@/lib/constants';

interface NavItem {
  id: string;
  to: string;
  labelKey: string;
  icon: React.ElementType;
  badge?: string;
  badgeKind?: 'warn' | 'err';
}

interface NavGroup {
  section: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  { section: 'overview', items: [
    { id: 'dashboard', to: '/app/dashboard', labelKey: 'sidebar.dashboard', icon: LayoutDashboard },
  ]},
  { section: 'flows', items: [
    { id: 'deposits',    to: '/app/deposits',    labelKey: 'sidebar.deposits',    icon: ArrowDownToLine, badge: '4' },
    { id: 'sweep',       to: '/app/sweep',       labelKey: 'sidebar.sweep',       icon: Shuffle,         badge: '12' },
    { id: 'withdrawals', to: '/app/withdrawals', labelKey: 'sidebar.withdrawals', icon: ArrowUpFromLine, badge: '3', badgeKind: 'warn' },
    { id: 'cold',        to: '/app/cold',        labelKey: 'sidebar.cold',        icon: Database },
  ]},
  { section: 'queue', items: [
    { id: 'multisig', to: '/app/multisig', labelKey: 'sidebar.multisig', icon: Shield,        badge: '5', badgeKind: 'warn' },
    { id: 'recovery', to: '/app/recovery', labelKey: 'sidebar.failedTxs', icon: AlertTriangle, badge: '4', badgeKind: 'err' },
  ]},
  { section: 'records', items: [
    { id: 'users',        to: '/app/users',        labelKey: 'sidebar.users',        icon: Users },
    { id: 'transactions', to: '/app/transactions', labelKey: 'sidebar.transactions', icon: Activity },
    { id: 'recon',        to: '/app/recon',        labelKey: 'sidebar.recon',        icon: CheckSquare },
    { id: 'audit',        to: '/app/audit',        labelKey: 'sidebar.audit',        icon: ScrollText },
  ]},
  { section: 'admin', items: [
    { id: 'signers',      to: '/app/signers',      labelKey: 'sidebar.signers',      icon: Key },
    { id: 'notifs',       to: '/app/notifs',       labelKey: 'sidebar.notifs',       icon: Bell },
    { id: 'architecture', to: '/app/architecture', labelKey: 'sidebar.architecture', icon: Network },
  ]},
];

interface SidebarProps {
  isMobile?: boolean;
}

export function Sidebar({ isMobile = false }: SidebarProps) {
  const { t } = useTranslation();
  const { collapsed, setMobileOpen } = useNavStore();
  const { staff } = useAuth();

  const isCollapsed = !isMobile && collapsed;

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-[var(--bg-elev)] border-r border-[var(--line)] transition-all duration-200',
        isCollapsed ? 'w-14' : 'w-56',
      )}
      data-collapsed={isCollapsed ? 'true' : 'false'}
    >
      {/* Brand */}
      <div className={cn('flex items-center gap-2.5 px-3 py-3 border-b border-[var(--line)]', isCollapsed && 'justify-center px-0')}>
        <div className="w-7 h-7 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
          W
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[var(--text)] truncate">{t('sidebar.brandName')}</div>
            <div className="text-[10px] text-[var(--text-faint)] truncate">{t('sidebar.brandMeta')}</div>
          </div>
        )}
        {isMobile && (
          <button
            className="ml-auto p-1 text-[var(--text-faint)] hover:text-[var(--text)]"
            onClick={() => setMobileOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {NAV.map((group) => (
          <div key={group.section} className="mb-2">
            {!isCollapsed && (
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                {t(`sidebar.${group.section}`)}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const label = t(item.labelKey);
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  onClick={() => isMobile && setMobileOpen(false)}
                  title={isCollapsed ? label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors',
                      'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]',
                      isActive && 'text-[var(--accent)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]',
                      isCollapsed && 'justify-center px-0',
                    )
                  }
                >
                  <Icon size={15} className="flex-shrink-0" />
                  {!isCollapsed && <span className="flex-1 truncate">{label}</span>}
                  {!isCollapsed && item.badge && (
                    <span className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                      item.badgeKind === 'err'  && 'bg-[var(--err-soft)] text-[var(--err-text)]',
                      item.badgeKind === 'warn' && 'bg-[var(--warn-soft)] text-[var(--warn-text)]',
                      !item.badgeKind           && 'bg-[var(--accent-soft)] text-[var(--accent-text)]',
                    )}>
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User footer */}
      {staff && !isCollapsed && (
        <div className="px-3 py-2 border-t border-[var(--line)] flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center text-[11px] font-semibold flex-shrink-0">
            {staff.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium text-[var(--text)] truncate">{staff.name}</div>
            <div className="text-[10px] text-[var(--text-faint)] truncate">{ROLES[staff.role]?.label}</div>
          </div>
        </div>
      )}
    </aside>
  );
}
