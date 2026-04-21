import { useCancelCeremony, useCeremony } from '@/api/signer-ceremony-queries';
import type { CeremonyRow, ChainCeremonyState, ChainCeremonyStatus } from '@/api/signers';
// Ceremony progress tracker — per-chain status bars for BNB + Solana.
// Shows: pending → signing → executing → confirmed | failed.
// Live updates via TanStack Query polling + socket invalidation.
// Cancel button available while status is pending/in_progress and no tx broadcast.
import { I } from '@/icons';
import { shortHash } from '@/lib/format';
import { useTranslation } from 'react-i18next';

// ── Chain step order ──────────────────────────────────────────────────────────

const STEP_ORDER: ChainCeremonyStatus[] = ['pending', 'signing', 'executing', 'confirmed'];

function stepIndex(s: ChainCeremonyStatus): number {
  const i = STEP_ORDER.indexOf(s);
  return i === -1 ? 0 : i;
}

// ── Per-chain bar ─────────────────────────────────────────────────────────────

interface ChainBarProps {
  chain: 'bnb' | 'solana';
  state: ChainCeremonyState | undefined;
}

function ChainBar({ chain, state }: ChainBarProps) {
  const { t } = useTranslation();
  const status = state?.status ?? 'pending';
  const activeStep = stepIndex(status);
  const isFailed = status === 'failed';
  const isCancelled = status === 'cancelled';

  const label = chain === 'bnb' ? 'BNB Chain (Safe)' : 'Solana (Squads)';
  const txHash = state?.txHash;
  const errorReason = state?.errorReason;

  return (
    <div className="ceremony-chain-bar" data-chain={chain}>
      <div className="hstack" style={{ marginBottom: 8, gap: 8 }}>
        <span className="text-sm fw-600">{label}</span>
        {isFailed && (
          <span className="badge-tight err">
            <I.AlertTri size={10} /> {t('signers.status.failed')}
          </span>
        )}
        {isCancelled && (
          <span className="badge-tight" style={{ opacity: 0.6 }}>
            {t('signers.status.cancelled')}
          </span>
        )}
        {status === 'confirmed' && (
          <span className="badge-tight ok">
            <I.Check size={10} /> {t('signers.status.confirmed')}
          </span>
        )}
      </div>

      {/* Step progress bar */}
      <div className="ceremony-steps">
        {STEP_ORDER.map((step, i) => {
          const done = !isFailed && !isCancelled && activeStep > i;
          const active = !isFailed && !isCancelled && activeStep === i;
          const tone = isFailed && activeStep === i ? 'err' : done ? 'ok' : active ? 'info' : '';
          return (
            <div
              key={step}
              className={`ceremony-step ${tone} ${active ? 'active' : ''} ${done ? 'done' : ''}`}
            >
              <div className="ceremony-step-dot">
                {done && <I.Check size={8} />}
                {isFailed && activeStep === i && <I.X size={8} />}
              </div>
              <span className="ceremony-step-label">{t(`signers.ceremony.step.${step}`)}</span>
            </div>
          );
        })}
      </div>

      {/* Tx hash link when available */}
      {txHash && (
        <div className="ceremony-txhash" style={{ marginTop: 6 }}>
          <I.External size={10} />
          <a
            href={
              chain === 'bnb'
                ? `https://bscscan.com/tx/${txHash}`
                : `https://solscan.io/tx/${txHash}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-mono link"
          >
            {shortHash(txHash, 10, 8)}
          </a>
        </div>
      )}

      {/* Error detail */}
      {isFailed && errorReason && (
        <div className="text-xs text-err" style={{ marginTop: 4 }}>
          {errorReason}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface CeremonyProgressProps {
  ceremony: CeremonyRow;
  /** Hide cancel button (e.g. in history view) */
  readOnly?: boolean;
}

export function CeremonyProgress({ ceremony, readOnly }: CeremonyProgressProps) {
  const { t } = useTranslation();
  const cancel = useCancelCeremony();

  const chainStates = ceremony.chainStates as Record<string, ChainCeremonyState>;
  const bnbState = chainStates.bnb;
  const solanaState = chainStates.solana;

  const canCancel =
    !readOnly &&
    (ceremony.status === 'pending' || ceremony.status === 'in_progress') &&
    bnbState?.status !== 'executing' &&
    bnbState?.status !== 'confirmed' &&
    solanaState?.status !== 'executing' &&
    solanaState?.status !== 'confirmed';

  const isPartial = ceremony.status === 'partial';

  const opLabel =
    ceremony.operationType === 'signer_add'
      ? t('signers.add.title')
      : ceremony.operationType === 'signer_remove'
        ? t('signers.remove.title')
        : t('signers.rotate.title');

  return (
    <div className="ceremony-progress">
      <div className="hstack" style={{ marginBottom: 12 }}>
        <div>
          <div className="text-sm fw-600">{opLabel}</div>
          <div className="text-xs text-muted text-mono">{ceremony.id.slice(0, 8)}…</div>
        </div>
        <div className="spacer" />
        {canCancel && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(ceremony.id)}
            style={{ color: 'var(--err-text)' }}
          >
            <I.X size={11} /> {t('common.cancel')}
          </button>
        )}
      </div>

      {/* Partial state red banner with runbook link */}
      {isPartial && (
        <div className="alert err" style={{ marginBottom: 12 }}>
          <I.AlertTri size={13} className="alert-icon" />
          <div className="alert-body">
            <div className="alert-title">{t('signers.ceremony.partialTitle')}</div>
            <div className="alert-text">
              {t('signers.ceremony.partialBody')}{' '}
              <a
                href="/docs/runbooks/signer-rotation"
                target="_blank"
                rel="noopener noreferrer"
                className="link"
              >
                {t('signers.ceremony.runbookLink')}
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="ceremony-chains">
        <ChainBar chain="bnb" state={bnbState} />
        <ChainBar chain="solana" state={solanaState} />
      </div>

      {ceremony.reason && (
        <div className="text-xs text-muted" style={{ marginTop: 8 }}>
          {t('signers.ceremony.reason')}: {ceremony.reason}
        </div>
      )}
    </div>
  );
}

// ── Async wrapper — loads ceremony by id ──────────────────────────────────────

interface CeremonyProgressByIdProps {
  ceremonyId: string;
  readOnly?: boolean;
}

export function CeremonyProgressById({ ceremonyId, readOnly }: CeremonyProgressByIdProps) {
  const { data, isPending, isError } = useCeremony(ceremonyId);
  const { t } = useTranslation();

  if (isPending) return <div className="text-xs text-muted">{t('common.loading')}</div>;
  if (isError || !data) return <div className="text-xs text-err">{t('common.error')}</div>;
  return <CeremonyProgress ceremony={data} readOnly={readOnly} />;
}
