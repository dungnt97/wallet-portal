// DetailSheet — "view / edit record" variant of the base `<Sheet>`.
//
// Most feature sheets share the same footer shape:
//   [secondary actions · spacer · primary actions]
//
// DetailSheet encodes that shape as typed arrays so you can write:
//
//   <DetailSheet
//     title="Deposit dep_2008f"
//     subtitle="USDT · BNB Chain"
//     badges={<StatusBadge status="credited" />}
//     secondaryActions={[{ label: 'View explorer', onClick: … }]}
//     actions={[{ label: 'Close', variant: 'secondary', onClick: onClose }]}
//   > … </DetailSheet>
//
// Sheets with highly conditional footers (RBAC-gated buttons, "you signed"
// stamps, etc.) can still drop through and pass `footer={…}` with raw JSX —
// the base `<Sheet>` slot is preserved.
import type { ReactNode } from 'react';
import { Sheet } from './sheet';

export interface DetailSheetAction {
  /** Button text (already translated). */
  label: ReactNode;
  onClick: () => void;
  /** Defaults to `secondary`. `danger` paints the label in error red. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';
  disabled?: boolean;
  /** Optional left-of-label icon. */
  icon?: ReactNode;
  /** Optional title / tooltip. */
  title?: string;
}

export interface DetailSheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Subtitle / ID / timestamp. */
  subtitle?: ReactNode;
  /** Badge nodes rendered inside the body just under the title block. */
  badges?: ReactNode;
  /** Body content — details, tables, timelines. */
  children: ReactNode;
  /**
   * Left-aligned footer buttons (secondary operations — e.g. "View explorer",
   * "View related op"). Rendered before the spacer.
   */
  secondaryActions?: DetailSheetAction[];
  /**
   * Right-aligned footer buttons (primary operations — e.g. "Close",
   * "Execute", "Approve").
   */
  actions?: DetailSheetAction[];
  /**
   * Escape hatch: fully custom footer. When provided, `actions` and
   * `secondaryActions` are ignored — use for conditional RBAC footers.
   */
  footer?: ReactNode;
  /** Widens the panel (560 → 720). Matches `<Sheet wide>` prototype class. */
  wide?: boolean;
}

function renderBtn(a: DetailSheetAction, key: number) {
  const variant = a.variant ?? 'secondary';
  const cls = variant === 'danger' ? 'btn btn-ghost' : `btn btn-${variant}`;
  const style = variant === 'danger' ? { color: 'var(--err-text)' } : undefined;
  return (
    <button
      key={key}
      type="button"
      className={cls}
      onClick={a.onClick}
      disabled={a.disabled}
      title={a.title}
      style={style}
    >
      {a.icon}
      {a.label}
    </button>
  );
}

/**
 * Detail sheet wrapping `<Sheet>` with optional action-array footer.
 * See file header for usage recipes.
 */
export function DetailSheet({
  open,
  onClose,
  title,
  subtitle,
  badges,
  children,
  secondaryActions,
  actions,
  footer,
  wide,
}: DetailSheetProps) {
  const builtFooter =
    footer !== undefined ? (
      footer
    ) : (secondaryActions && secondaryActions.length > 0) || (actions && actions.length > 0) ? (
      <>
        {secondaryActions?.map(renderBtn)}
        <div className="spacer" />
        {actions?.map(renderBtn)}
      </>
    ) : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={builtFooter}
      wide={wide}
    >
      {badges && <div style={{ marginBottom: 12 }}>{badges}</div>}
      {children}
    </Sheet>
  );
}
