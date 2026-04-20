// PageFrame — the standard feature-page skeleton.
//
// Renders, top-to-bottom:
//   [policyStrip]   (optional slot — `<div className="policy-strip">…</div>`)
//   [page-header]   (eyebrow + title + subtitle · right-side actions slot)
//   [KpiStrip]      (optional — built from `kpis` items)
//   [children]      (your feature body: filters, table, sheet, etc.)
//
// Why slot-based `policyStrip` + `actions`? Real pages pack them with
// `<BlockTicker>`, `<LiveDot>`, RBAC-gated buttons, and i18n'd spans. A
// typed items API would either force boilerplate escape hatches everywhere
// or mask the richness of the prototype markup. Slots stay out of the way.
//
// Prototype CSS classes preserved: `.page.page-dense`, `.page-header`,
// `.page-eyebrow`, `.page-title`, `.page-actions`, `.env-inline`.
import type { ReactNode } from 'react';

export interface PageFrameProps {
  /**
   * Short eyebrow rendered above the title.
   * Callers commonly pass `{category} · <span className="env-inline">{subcat}</span>`.
   */
  eyebrow?: ReactNode;
  /** Main page title — the `<h1>`. */
  title: ReactNode;
  /** Optional subtitle / descriptor, rendered under the title. */
  subtitle?: ReactNode;
  /**
   * Right-aligned header slot. Usually contains a Refresh / Export / New
   * button cluster. Render them as plain children — the `.page-actions`
   * flex container handles spacing.
   */
  actions?: ReactNode;
  /**
   * Full policy-strip node. Pass the original `<div className="policy-strip">…</div>`
   * markup or a purpose-built component. Leave undefined to omit.
   */
  policyStrip?: ReactNode;
  /**
   * KPI node rendered between the header and the body. Pass a feature-specific
   * `<XxxKpiStrip …/>` component, or a bare `<KpiStrip items={…}/>`. Omit for
   * pages that don't surface KPIs (recovery, notifs, architecture).
   */
  kpis?: ReactNode;
  /** Main body content — table, panels, forms. */
  children: ReactNode;
  /**
   * Apply `.page-dense` to the outer wrapper. Defaults to `true`; set `false`
   * for the Architecture / docs pages that use the looser `.page` layout.
   */
  dense?: boolean;
  /** Extra class appended to the outer `.page.page-dense` wrapper. */
  className?: string;
}

/**
 * Standard feature-page frame. See file header for layout + rationale.
 *
 * @example
 * ```tsx
 * <PageFrame
 *   eyebrow={<>{t('deposits.eyebrow')} · <span className="env-inline">{t('deposits.subEyebrow')}</span></>}
 *   title={t('deposits.title')}
 *   policyStrip={<DepositsPolicyStrip />}
 *   kpis={<DepositsKpiStrip deposits={deposits} />}
 *   actions={<><button>Refresh</button><button>Export</button></>}
 * >
 *   <DepositsTable rows={rows} />
 * </PageFrame>
 * ```
 */
export function PageFrame({
  eyebrow,
  title,
  subtitle,
  actions,
  policyStrip,
  kpis,
  children,
  dense = true,
  className,
}: PageFrameProps) {
  const cls = ['page', dense && 'page-dense', className].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      {policyStrip}
      <div className="page-header">
        <div>
          {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
          <h1 className="page-title">{title}</h1>
          {subtitle && <div className="page-subtitle">{subtitle}</div>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {kpis}
      {children}
    </div>
  );
}
