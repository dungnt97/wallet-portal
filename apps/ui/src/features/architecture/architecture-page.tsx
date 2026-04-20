import { PageFrame, Tabs } from '@/components/custody';
// Architecture page — tabbed viewer: service map, flows, sequence, data,
// API, jobs, security, MVP plan. Ports prototype page_architecture.jsx.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TabApi } from './tab-api';
import { TabDomain } from './tab-domain';
import { TabJobs } from './tab-jobs';
import { TabLifecycle } from './tab-lifecycle';
import { TabMvp } from './tab-mvp';
import { TabSecurity } from './tab-security';
import { TabSequence } from './tab-sequence';
import { TabServiceMap } from './tab-service-map';

type Tab = 'overview' | 'flows' | 'sequence' | 'data' | 'api' | 'jobs' | 'security' | 'mvp';

export function ArchitecturePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <PageFrame
      dense={false}
      title={t('architecture.title')}
      subtitle={t('architecture.subtitle')}
      actions={<span className="badge muted text-mono">v0.4.2 · 18 Apr 2026</span>}
    >
      <Tabs
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        tabs={[
          { value: 'overview', label: 'Service map' },
          { value: 'flows', label: 'Lifecycle flows' },
          { value: 'sequence', label: 'Sequence diagrams' },
          { value: 'data', label: 'Domain model' },
          { value: 'api', label: 'API surface' },
          { value: 'jobs', label: 'Background jobs' },
          { value: 'security', label: 'Security' },
          { value: 'mvp', label: 'MVP plan' },
        ]}
      />

      {tab === 'overview' && <TabServiceMap />}
      {tab === 'flows' && <TabLifecycle />}
      {tab === 'sequence' && <TabSequence />}
      {tab === 'data' && <TabDomain />}
      {tab === 'api' && <TabApi />}
      {tab === 'jobs' && <TabJobs />}
      {tab === 'security' && <TabSecurity />}
      {tab === 'mvp' && <TabMvp />}
    </PageFrame>
  );
}
