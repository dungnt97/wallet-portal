import { useAuth } from '@/auth/use-auth';
import { I } from '@/icons';
import { ROLES } from '@/lib/constants';
import { useTranslation } from 'react-i18next';
// Sidebar — brand + grouped nav + user footer. Matches prototype shell.jsx.
// Visual styling lives in base.css (.sidebar, .nav-item, .nav-badge, …) —
// we only render the markup and respond to the collapsed attribute.
import { NavLink } from 'react-router-dom';
import { NAV } from './nav-structure';
import { useSidebarCounts } from './use-sidebar-counts';

interface Props {
  collapsed: boolean;
  /** When rendered inside the mobile overlay we hide the brand close button */
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onNavigate }: Props) {
  const { t } = useTranslation();
  const { staff } = useAuth();
  const counts = useSidebarCounts();

  return (
    <aside className="sidebar" data-collapsed={collapsed ? 'true' : 'false'}>
      <div className="sidebar-brand">
        <div className="brand-mark">W</div>
        <div>
          <div className="brand-name">{t('sidebar.brandName')}</div>
          <div className="brand-meta">{t('sidebar.brandMeta')}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="nav-section-label">{t(`sidebar.${group.section}`)}</div>
            {group.items.map((item) => {
              const Icon = I[item.iconKey];
              const label = t(item.labelKey);
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon className="nav-icon" />
                  <span className="nav-label">{label}</span>
                  {(() => {
                    // Resolve live count for this nav item; fall back to static badge from nav-structure
                    const liveCount = counts[item.id as keyof typeof counts];
                    const badge =
                      liveCount !== undefined && liveCount !== null
                        ? liveCount > 0
                          ? String(liveCount)
                          : undefined
                        : item.badge;
                    return badge ? (
                      <span className={`nav-badge ${item.badgeKind ?? ''}`}>{badge}</span>
                    ) : null;
                  })()}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {staff && (
        <div className="sidebar-footer">
          <div className="avatar">{staff.initials}</div>
          <div className="sidebar-footer-text">
            <span className="sidebar-footer-name">{staff.name}</span>
            <span className="sidebar-footer-role">
              <span
                className={`role-pill role-${staff.role}`}
                style={{ padding: '0 6px', fontSize: 10 }}
              >
                {ROLES[staff.role]?.label}
              </span>
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
