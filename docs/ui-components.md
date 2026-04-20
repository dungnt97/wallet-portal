# UI Components API Reference

Canonical guide for every reusable component in `apps/ui/src/`. Start here when building a new feature page.

All components preserve the prototype CSS class names in `apps/ui/src/styles/` — they are wrappers, not replacements.

---

## 1. Folder structure

```
apps/ui/src/
├── api/              # fetch helpers, socket client, generated OpenAPI types
├── auth/             # use-auth hook, MFA / WebAuthn helpers, RBAC permission set
├── components/       # reusable UI primitives (this doc focuses here)
│   ├── custody/      # domain-aware primitives (ChainPill, StatusBadge, KpiStrip, PageFrame, DataTable …)
│   ├── overlays/     # Sheet, DetailSheet, Modal, ToastHost, NotificationsPanel
│   └── page-shell.tsx
├── features/         # one folder per feature — co-locate page + table + sheet + hooks
│   ├── _shared/
│   │   ├── fixtures/ # canonical prototype fixtures (see README inside)
│   │   ├── charts.tsx
│   │   ├── helpers.ts
│   │   └── realtime.tsx
│   ├── audit/ cold/ deposits/ multisig/ signers/ sweep/
│   ├── transactions/ users/ withdrawals/
│   ├── architecture/ dashboard/ login/ notifs/ recon/ recovery/
│   └── signing/
├── i18n/             # react-i18next setup, locale JSON
├── icons/            # single-file icon catalog (registry map)
├── lib/              # framework-independent utilities (format, constants)
├── router.tsx        # react-router v6 route tree
├── shell/            # app shell — sidebar, topbar, tweaks-panel, command palette
├── stores/           # zustand global state (tweaks, session)
├── styles/           # prototype CSS (base, tokens, pro-dashboard, missing)
├── tests/            # vitest specs
└── App.tsx
```

---

## 2. Design tokens

OKLCH colour palette + spacing scale ship from the workspace package `@wp/ui-kit` via `tokens.css`. The UI app imports the base stylesheet in `App.tsx`; every component uses `var(--…)` references.

Key token families (see `packages/ui-kit/src/tokens.css`):

| Family   | Examples                                           | Use in component                       |
|----------|----------------------------------------------------|----------------------------------------|
| Text     | `--text`, `--text-muted`, `--text-faint`           | `className="text-muted text-faint"`    |
| Surface  | `--bg`, `--surface`, `--card`                      | card + panel backgrounds               |
| Brand    | `--accent`, `--accent-text`, `--accent-soft`       | primary buttons, highlights            |
| Semantic | `--ok`, `--warn`, `--err`, `--info` (+ `-soft`, `-text`) | status badges, delta pills, alerts |
| Chain    | `--bnb`, `--sol`                                   | `<ChainPill>`                          |
| Stroke   | `--stroke`, `--stroke-strong`                      | table borders, dividers                |

Typography: default stack Inter (body) + JetBrains Mono (`.text-mono`). `data-typography="mono"` on `<html>` toggles prototype mono-body mode — preserved in `index.html`.

---

## 3. Custody primitives — `apps/ui/src/components/custody/`

Barrel: `import { … } from '@/components/custody'`

| Component | Description | Source |
|---|---|---|
| `Address` | Short-form on-chain address with chain-aware styling. | `address.tsx` |
| `ChainPill` | Chain logo + label pill (`'bnb' \| 'sol'`). | `chain-pill.tsx` |
| `DataTable<T>` | Generic table + optional selection column + empty state. | `data-table.tsx` |
| `Filter` / `Tabs` / `Toggle` / `Segmented` | Inline filter chip, tab bar, switch, segmented control. | `controls.tsx` |
| `Hash` | Short tx hash with copy button. | `hash.tsx` |
| `KpiItem`, `KpiStrip` | 4-up metric row — the `.kpi-strip > .kpi-mini` prototype. | `kpi-strip.tsx` |
| `PageFrame` | Standard page skeleton: policy strip → header → kpis → children. | `page-frame.tsx` |
| `Risk` | Risk level chip (`'low' \| 'med' \| 'high'`). | `risk.tsx` |
| `StatCard` | Large-number stat card (dashboard hero tile). | `stat-card.tsx` |
| `StatusBadge` | Deposit / withdrawal stage badge. | `status-badge.tsx` |
| `TokenPill` | USDT / USDC pill with optional amount. | `token-pill.tsx` |

### `KpiStrip`

```tsx
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';

<KpiStrip
  items={[
    {
      key: 'pending',
      label: <><I.Clock size={10} /> Pending</>,
      value: '$42.1K',
      foot: <span className="text-xs text-muted">12 txs</span>,
    },
    // … usually 4 items
  ]}
/>
```

Feature pages wrap this in `{feature}-kpi-strip.tsx` so data shaping stays at the call site and the presentation stays primitive.

### `PageFrame`

```tsx
import { PageFrame } from '@/components/custody';

<PageFrame
  eyebrow={<>Treasury · <span className="env-inline">Withdrawals</span></>}
  title={t('withdrawals.title')}
  policyStrip={<WithdrawalsPolicyStrip />}
  actions={<><button>Export</button><button>New</button></>}
  kpis={<WithdrawalsKpiStrip list={list} />}
>
  <WithdrawalsTable rows={filtered} />
</PageFrame>
```

- `policyStrip` / `actions` / `kpis` / `subtitle` are all `ReactNode` slots — pass raw JSX.
- `dense={false}` switches from `.page.page-dense` to `.page` (used by the Architecture page).
- `subtitle` renders inside `.page-subtitle`.

### `DataTable<T>`

```tsx
import { DataTable, type Column } from '@/components/custody';

const columns: Column<Row>[] = [
  { label: 'ID', render: (r) => r.id, width: 120 },
  { label: 'Amount', render: (r) => `$${r.amount}`, num: true },
];

<DataTable
  columns={columns}
  rows={rows}
  onRowClick={(r) => setSelected(r)}
  selectable
  selectedIds={selection}
  onToggleSelect={toggle}
  onToggleAll={toggleAll}
  getRowId={(r) => r.id}
/>
```

---

## 4. Overlays — `apps/ui/src/components/overlays/`

Barrel: `import { … } from '@/components/overlays'`

| Component | Description | Source |
|---|---|---|
| `Modal` | Centred dialog with title / body / footer slots. | `modal.tsx` |
| `Sheet` | Right-edge slide-in panel (base primitive). | `sheet.tsx` |
| `DetailSheet` | Variant of `Sheet` with action-array footer + badges slot. | `detail-sheet.tsx` |
| `NotificationsPanel` | Topbar-triggered notification drawer. | `notifications-panel.tsx` |
| `ToastHost` + `useToast` | Global toast host; `useToast()` returns a `toast(msg, variant?)` fn. | `toast-host.tsx` |

### `Sheet` vs `DetailSheet`

- Use `Sheet` directly when the footer is highly conditional (RBAC gates, "you signed" stamps, etc.).
- Use `DetailSheet` when the footer fits a simple `[secondary-actions · spacer · primary-actions]` shape OR when you want the `badges` slot.
- `DetailSheet` still accepts `footer={…}` as an escape hatch — used by `multisig-sheet` and `withdrawals-sheet`.

```tsx
import { DetailSheet } from '@/components/overlays';

<DetailSheet
  open={!!user}
  onClose={onClose}
  title={user.name}
  subtitle={user.email}
  badges={<StatusBadge status="active" />}
  secondaryActions={[{ label: 'BSCScan', onClick: openBsc }]}
  actions={[{ label: 'Close', variant: 'secondary', onClick: onClose }]}
>
  <dl className="dl">…</dl>
</DetailSheet>
```

---

## 5. Shell — `apps/ui/src/shell/`

| File | Responsibility |
|---|---|
| `app-layout.tsx` | Grid wrapper: sidebar + topbar + content. Provides viewport hooks. |
| `sidebar.tsx` | Primary nav based on `nav-structure.ts`. |
| `topbar.tsx` | Env picker, notifications bell, user menu, command-palette trigger. |
| `mobile-nav.tsx` | Responsive drawer on <1100px. |
| `command-palette.tsx` | `Cmd/Ctrl-K` action launcher. |
| `tweaks-panel.tsx` | Developer settings drawer (density, risk flags). Backed by `stores/tweaks-store`. |
| `user-menu.tsx` | Avatar dropdown — staff info + logout. |
| `env-picker.tsx` | Env selector in topbar. |
| `viewport-hooks.ts` | `useViewport()` width watcher. |
| `nav-structure.ts` | Routes + icon assignments; single source of truth for sidebar + palette. |

When adding a new feature page, register its route and icon in `nav-structure.ts`.

---

## 6. Page composition pattern

Building a new feature page:

1. Create `features/{feature}/` folder.
2. Add fixtures to `features/_shared/fixtures/{feature}.ts` — export typed data, add the file to `fixtures/index.ts`.
3. Build a `{feature}-table.tsx` using `<DataTable>`.
4. Build a `{feature}-sheet.tsx` (detail drawer) using `<DetailSheet>`.
5. Build a `{feature}-kpi-strip.tsx` — a thin wrapper around `<KpiStrip>` that computes derived values.
6. Build a `{feature}-policy-strip.tsx` — the compliance row rendered above the header.
7. Compose in `{feature}-page.tsx` using `<PageFrame>`:

```tsx
export function MyFeaturePage() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<MyRow | null>(null);

  return (
    <PageFrame
      eyebrow={<>…</>}
      title={t('myfeature.title')}
      policyStrip={<MyFeaturePolicyStrip />}
      actions={<button className="btn btn-secondary">Export</button>}
      kpis={<MyFeatureKpiStrip rows={rows} />}
    >
      <div className="card pro-card" style={{ marginTop: 14 }}>
        <MyFeatureTable rows={rows} onSelect={setSelected} />
      </div>
      <MyFeatureSheet row={selected} onClose={() => setSelected(null)} />
    </PageFrame>
  );
}
```

8. Add the route to `router.tsx` and sidebar entry to `shell/nav-structure.ts`.

---

## 7. Conventions

- **Filenames** — kebab-case, descriptive (`withdrawals-policy-strip.tsx`). Long names are preferred for Grep-friendliness.
- **File size** — aim for ≤200 LOC. Split by extracting sub-components, hooks, or fixtures (not by arbitrary character counts).
- **TypeScript strict** — no `any`; every public component exports a typed props interface.
- **JSDoc** — every primitive (KpiStrip, PageFrame, DetailSheet, etc.) has a JSDoc header + per-prop doc.
- **i18n** — pages use `useTranslation()` from `react-i18next`. Primitives accept translated strings as `ReactNode`; never hardcode keys inside a primitive.
- **CSS** — prototype CSS classes in `styles/` are authoritative. Components WRAP those classes. Never introduce a new styled-components / CSS-module layer.
- **shadcn/ui** — NOT used. `components/ui/` is intentionally absent. If you see a shadcn import suggestion, reject it; reach for the custody primitive instead.
- **Fixtures** — all prototype data lives in `features/_shared/fixtures/`. Never add fixtures to a feature folder.
- **Icons** — use `import { I } from '@/icons'`, then `<I.Shield size={12} />`. New icons get added to `icons/index.tsx`.
- **Imports** — auto-sorted by biome; `@/` alias is the project root.

---

## 8. Adding a new primitive

Checklist:

- [ ] Place in `apps/ui/src/components/custody/` (if domain-aware) or `components/overlays/` (if portal/stacking).
- [ ] Export a TypeScript props interface (never `any`).
- [ ] Add a JSDoc block above the interface + each prop; include one `@example` on the component.
- [ ] Wrap the prototype CSS class(es); don't invent new ones.
- [ ] Re-export from the folder barrel (`index.ts`).
- [ ] Use it in at least ONE feature page; don't speculatively create primitives.
- [ ] Add a row to this doc (section 3 or 4) with: description, import path, minimal usage.

---

## 9. Quick recipes

**Gate a button on RBAC:**
```tsx
{hasPerm('withdrawal.create') ? (
  <button className="btn btn-accent">New</button>
) : (
  <button className="btn btn-accent" disabled title="Requires treasurer role">
    <I.Lock size={13} /> New
  </button>
)}
```

**Toast on success:**
```tsx
const toast = useToast();
toast('Exported 42 rows.', 'success');
```

**Optimistic update pattern:** see `features/withdrawals/use-withdrawal-actions.ts` — local override map + `useMemo` merge.

**Policy strip with live dots + block tickers:** follow `features/withdrawals/withdrawals-policy-strip.tsx`.
