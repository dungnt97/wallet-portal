import { Segmented, Toggle } from '@/components/custody';
// Tweaks panel — floating bottom-right dock with theme/density/accent/
// typography + sidebar/risk toggles. Ports prototype tweaks.jsx.
// All six controls write back to the Zustand store; the store's
// setters apply the matching `data-*` attr on <html> (see tweaks-store).
import { I } from '@/icons';
import {
  type Accent,
  type Density,
  type Lang,
  type Theme,
  type Typography,
  useTweaksStore,
} from '@/stores/tweaks-store';
import { useTranslation } from 'react-i18next';

interface Props {
  onClose: () => void;
}

// Swatch palette taken from prototype tweaks.jsx — OKLCH preview only;
// active accent is applied via data-accent attr, CSS variables in base.css
// take care of the rest.
const ACCENTS: Array<{ id: Accent; preview: string }> = [
  { id: 'indigo', preview: 'oklch(55% 0.18 268)' },
  { id: 'emerald', preview: 'oklch(58% 0.16 165)' },
  { id: 'amber', preview: 'oklch(70% 0.16 70)' },
  { id: 'rose', preview: 'oklch(60% 0.18 12)' },
  { id: 'slate', preview: 'oklch(40% 0.02 260)' },
];

export function TweaksPanel({ onClose }: Props) {
  const { t } = useTranslation();
  const tweaks = useTweaksStore();

  return (
    <div className="tweaks-panel">
      <div className="tweaks-header">
        <span className="tweaks-title">{t('topbar.tweaks')}</span>
        <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
          <I.X size={13} />
        </button>
      </div>

      <div className="tweaks-body">
        <div className="tweak-row">
          <span className="tweak-label">{t('topbar.language')}</span>
          <Segmented<Lang>
            options={[
              { value: 'en', label: 'EN' },
              { value: 'vi', label: 'VI' },
            ]}
            value={tweaks.lang}
            onChange={tweaks.setLang}
          />
        </div>

        <div className="tweak-row">
          <span className="tweak-label">Theme</span>
          <Segmented<Theme>
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            value={tweaks.theme}
            onChange={tweaks.setTheme}
          />
        </div>

        <div className="tweak-row">
          <span className="tweak-label">Density</span>
          <Segmented<Density>
            options={[
              { value: 'compact', label: 'S' },
              { value: 'comfortable', label: 'M' },
              { value: 'cozy', label: 'L' },
            ]}
            value={tweaks.density}
            onChange={tweaks.setDensity}
          />
        </div>

        <div className="tweak-row">
          <span className="tweak-label">Accent</span>
          <div className="tweak-swatches">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                className={`tweak-swatch ${tweaks.accent === a.id ? 'active' : ''}`}
                style={{ background: a.preview }}
                onClick={() => tweaks.setAccent(a.id)}
                title={a.id}
              />
            ))}
          </div>
        </div>

        <div className="tweak-row">
          <span className="tweak-label">Typography</span>
          <Segmented<Typography>
            options={[
              { value: 'sans', label: 'Sans' },
              { value: 'mono', label: 'Mono' },
            ]}
            value={tweaks.typography}
            onChange={tweaks.setTypography}
          />
        </div>

        <div className="tweak-row">
          <span className="tweak-label">Sidebar</span>
          <Toggle on={!tweaks.sidebarCollapsed} onChange={(v) => tweaks.setSidebarCollapsed(!v)} />
        </div>

        <div className="tweak-row">
          <span className="tweak-label">Risk flags</span>
          <Toggle on={tweaks.showRiskFlags} onChange={tweaks.setShowRiskFlags} />
        </div>
      </div>
    </div>
  );
}
