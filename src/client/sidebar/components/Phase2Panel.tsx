import React, { useEffect, useState } from 'react';
import { Phase2AResult, Phase2BResult, RollbackResult, RotationSummary } from '../types';
import WarningList from './WarningList';

interface Props {
  summary: RotationSummary | null;
  onComplete: () => void;
}

export default function Phase2Panel({ summary, onComplete }: Props) {
  const tiers = summary?.tiers ?? [];

  const [promoteCount, setPromoteCount] = useState(1);
  const [demoteCount, setDemoteCount] = useState(1);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingCommit, setLoadingCommit] = useState(false);
  const [loadingActivate, setLoadingActivate] = useState(false);
  const [loadingRollback, setLoadingRollback] = useState(false);

  const [previewResult, setPreviewResult] = useState<Phase2AResult | null>(null);
  const [commitResult, setCommitResult] = useState<Phase2AResult | null>(null);
  const [activateResult, setActivateResult] = useState<Phase2BResult | null>(null);
  const [rollbackResult, setRollbackResult] = useState<RollbackResult | null>(null);
  const [hasBackup, setHasBackup] = useState(false);

  // Check for existing backup on mount and after commit
  function checkBackup() {
    google.script.run
      .withSuccessHandler((has: boolean) => setHasBackup(has))
      .withFailureHandler(() => setHasBackup(false))
      .hasRollbackData();
  }

  useEffect(() => {
    checkBackup();
  }, []);

  function handlePreview() {
    setLoadingPreview(true);
    setPreviewResult(null);
    setCommitResult(null);
    google.script.run
      .withSuccessHandler((res: Phase2AResult) => {
        setPreviewResult(res);
        setLoadingPreview(false);
      })
      .withFailureHandler((err: Error) => {
        setPreviewResult({
          success: false,
          warnings: [err.message],
          promotions: [],
          demotions: [],
          dnfPlayers: [],
          preview: true,
        });
        setLoadingPreview(false);
      })
      .previewEndCycle(tiers, promoteCount, demoteCount);
  }

  function handleCommit() {
    if (!confirm('Commit promotions and demotions to Participants? A backup will be saved so you can rollback if needed.')) return;
    setLoadingCommit(true);
    setCommitResult(null);
    setRollbackResult(null);
    google.script.run
      .withSuccessHandler((res: Phase2AResult) => {
        setCommitResult(res);
        setLoadingCommit(false);
        if (res.success) {
          onComplete();
          checkBackup();
        }
      })
      .withFailureHandler((err: Error) => {
        setCommitResult({
          success: false,
          warnings: [err.message],
          promotions: [],
          demotions: [],
          dnfPlayers: [],
          preview: false,
        });
        setLoadingCommit(false);
      })
      .commitEndCycle(tiers, promoteCount, demoteCount);
  }

  function handleActivate() {
    setLoadingActivate(true);
    setActivateResult(null);
    google.script.run
      .withSuccessHandler((res: Phase2BResult) => {
        setActivateResult(res);
        setLoadingActivate(false);
        if (res.success) onComplete();
      })
      .withFailureHandler((_err: Error) => {
        setActivateResult({ success: false, activatedPlayers: [] });
        setLoadingActivate(false);
      })
      .activateQueuedPlayers();
  }

  function handleRollback() {
    if (!confirm('Restore Participants from the last backup? This will reverse all promotions, demotions, and DNF changes from the last committed End Cycle.')) return;
    setLoadingRollback(true);
    setRollbackResult(null);
    google.script.run
      .withSuccessHandler((res: RollbackResult) => {
        setRollbackResult(res);
        setLoadingRollback(false);
        if (res.success) {
          onComplete();
          checkBackup();
        }
      })
      .withFailureHandler((err: Error) => {
        setRollbackResult({ success: false, message: err.message });
        setLoadingRollback(false);
      })
      .rollbackEndCycle();
  }

  const activeResult = commitResult ?? previewResult;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ── Step A ── */}
      <div className="card">
        <h2>Step A — Calculate Promotions &amp; Demotions</h2>

        <div className="form-row">
          <label>Promote top N per group</label>
          <input
            type="number"
            value={promoteCount}
            min={0}
            onChange={e => setPromoteCount(parseInt(e.target.value, 10))}
          />
        </div>
        <div className="form-row">
          <label>Demote bottom N per group</label>
          <input
            type="number"
            value={demoteCount}
            min={0}
            onChange={e => setDemoteCount(parseInt(e.target.value, 10))}
          />
        </div>

        {tiers.length === 0 && (
          <p style={{ fontSize: 12, color: '#5f6368', marginBottom: 8 }}>
            No active tiers detected. Refresh the status panel or ensure the Participants sheet has
            active players.
          </p>
        )}

        <div className="button-row">
          <button
            className="btn-secondary"
            onClick={handlePreview}
            disabled={loadingPreview || tiers.length === 0}
          >
            {loadingPreview ? 'Loading…' : 'Preview'}
          </button>
          <button
            className="btn-danger"
            onClick={handleCommit}
            disabled={loadingCommit || tiers.length === 0}
          >
            {loadingCommit ? 'Committing…' : 'Commit'}
          </button>
        </div>

        {(loadingPreview || loadingCommit) && (
          <div className="loading" style={{ marginTop: 8 }}>
            <div className="spinner" />
            Reading scores…
          </div>
        )}

        {activeResult && (
          <div style={{ marginTop: 10 }}>
            {activeResult.success ? (
              <>
                {commitResult && !commitResult.preview && (
                  <div className="banner banner-success" style={{ marginBottom: 8 }}>
                    Committed. A backup was saved — use Rollback below to undo if needed.
                  </div>
                )}

                {activeResult.dnfPlayers.length > 0 && (
                  <div className="move-list">
                    <h3>DNF ({activeResult.dnfPlayers.length})</h3>
                    {activeResult.dnfPlayers.map((p, i) => (
                      <div key={i} className="dnf">
                        {p.name} ({p.tier})
                      </div>
                    ))}
                  </div>
                )}

                {activeResult.promotions.length > 0 && (
                  <div className="move-list">
                    <h3>Promotions ({activeResult.promotions.length})</h3>
                    {activeResult.promotions.map((m, i) => (
                      <div key={i} className="promote">
                        ↑ {m.player.name}: {m.fromTier} → {m.toTier}
                      </div>
                    ))}
                  </div>
                )}

                {activeResult.demotions.length > 0 && (
                  <div className="move-list">
                    <h3>Demotions ({activeResult.demotions.length})</h3>
                    {activeResult.demotions.map((m, i) => (
                      <div key={i} className="demote">
                        ↓ {m.player.name}: {m.fromTier} → {m.toTier}
                      </div>
                    ))}
                  </div>
                )}

                {activeResult.promotions.length === 0 &&
                  activeResult.demotions.length === 0 &&
                  activeResult.dnfPlayers.length === 0 && (
                    <p style={{ fontSize: 12, color: '#5f6368' }}>No movements to apply.</p>
                  )}
              </>
            ) : (
              <div className="banner banner-error" style={{ marginBottom: 8 }}>
                Failed — see warnings.
              </div>
            )}
            <WarningList warnings={activeResult.warnings} />
          </div>
        )}
      </div>

      <hr className="divider" />

      {/* ── Rollback ── */}
      {hasBackup && (
        <div className="card">
          <h2>Rollback Last Commit</h2>
          <p style={{ fontSize: 12, color: '#5f6368', marginBottom: 10 }}>
            A backup of Participants exists from the last committed End Cycle. Rollback restores
            tier assignments and statuses to exactly what they were before that commit.
          </p>

          <button
            className="btn-danger"
            onClick={handleRollback}
            disabled={loadingRollback}
          >
            {loadingRollback ? 'Restoring…' : 'Rollback'}
          </button>

          {loadingRollback && (
            <div className="loading" style={{ marginTop: 8 }}>
              <div className="spinner" />
              Restoring Participants…
            </div>
          )}

          {rollbackResult && (
            <div style={{ marginTop: 10 }}>
              <div className={`banner ${rollbackResult.success ? 'banner-success' : 'banner-error'}`}>
                {rollbackResult.message}
              </div>
            </div>
          )}
        </div>
      )}

      <hr className="divider" />

      {/* ── Step B ── */}
      <div className="card">
        <h2>Step B — Activate Queued Players</h2>
        <p style={{ fontSize: 12, color: '#5f6368', marginBottom: 10 }}>
          Moves all QUEUED players to ACTIVE. They will be sorted into groups on the next Phase 1
          run.
          {summary && summary.queuedPlayers > 0
            ? ` (${summary.queuedPlayers} queued)`
            : ' (none currently queued)'}
        </p>

        <button
          className="btn-primary"
          onClick={handleActivate}
          disabled={loadingActivate || (summary?.queuedPlayers ?? 0) === 0}
        >
          {loadingActivate ? 'Activating…' : 'Activate Queued Players'}
        </button>

        {loadingActivate && (
          <div className="loading" style={{ marginTop: 8 }}>
            <div className="spinner" />
            Updating Participants…
          </div>
        )}

        {activateResult && (
          <div style={{ marginTop: 10 }}>
            {activateResult.success ? (
              <div className="banner banner-success">
                {activateResult.activatedPlayers.length > 0
                  ? `Activated: ${activateResult.activatedPlayers.map(p => p.name).join(', ')}`
                  : 'No queued players to activate.'}
              </div>
            ) : (
              <div className="banner banner-error">Activation failed.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
