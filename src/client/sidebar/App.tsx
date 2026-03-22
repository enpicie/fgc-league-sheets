import React, { useCallback, useEffect, useState } from 'react';
import StatusPanel from './components/StatusPanel';
import Phase1Panel from './components/Phase1Panel';
import Phase2Panel from './components/Phase2Panel';
import { RotationSummary } from './types';

type Tab = 'phase1' | 'phase2';

export default function App() {
  const [tab, setTab] = useState<Tab>('phase1');
  const [summary, setSummary] = useState<RotationSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const refreshSummary = useCallback(() => {
    setLoadingSummary(true);
    google.script.run
      .withSuccessHandler((res: RotationSummary) => {
        setSummary(res);
        setLoadingSummary(false);
      })
      .withFailureHandler(() => {
        setSummary(null);
        setLoadingSummary(false);
      })
      .getRotationSummary();
  }, []);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  return (
    <div className="app">
      <h1>League Manager</h1>

      <StatusPanel summary={summary} loading={loadingSummary} onRefresh={refreshSummary} />

      <div className="tabs">
        <button
          className={`tab ${tab === 'phase1' ? 'active' : ''}`}
          onClick={() => setTab('phase1')}
        >
          Phase 1 — Start Cycle
        </button>
        <button
          className={`tab ${tab === 'phase2' ? 'active' : ''}`}
          onClick={() => setTab('phase2')}
        >
          Phase 2 — End Cycle
        </button>
      </div>

      {tab === 'phase1' && (
        <Phase1Panel summary={summary} onComplete={refreshSummary} />
      )}
      {tab === 'phase2' && (
        <Phase2Panel summary={summary} onComplete={refreshSummary} />
      )}
    </div>
  );
}
