import React, { useState } from 'react';
import { Phase1Result, TierConfigRow, RotationSummary } from '../types';
import WarningList from './WarningList';

interface Props {
  summary: RotationSummary | null;
  onComplete: () => void;
}

// Recommended defaults per the league setup guide:
//   - Top tier (S): 1 group  →  most competitive, fewest players
//   - Second tier (A): 2 groups
//   - Remaining tiers: auto-derived by the algorithm
//   - Group size: 5–7 (minimum 5 keeps schedules manageable; maximum 7 fits a rotation)
const DEFAULT_MIN = 5;
const DEFAULT_MAX = 7;

const DEFAULT_TIERS: TierConfigRow[] = [
  { name: 'S', desiredGroups: '1' },
  { name: 'A', desiredGroups: '2' },
  { name: 'B', desiredGroups: '' },
  { name: 'C', desiredGroups: '' },
  { name: 'D', desiredGroups: '' },
];

const HINT_GROUPS =
  'Recommended: 1 group for top tier, 2 for 2nd tier. Leave blank to auto-derive — ' +
  'the algorithm picks the fewest groups that keep each group within the size range.';
const HINT_SIZE =
  'Recommended: 5–7 players per group. Smaller groups reduce schedule length; ' +
  'larger groups increase competitive variety. Default is 5 min / 7 max.';

export default function Phase1Panel({ summary, onComplete }: Props) {
  const [minSize, setMinSize] = useState(DEFAULT_MIN);
  const [maxSize, setMaxSize] = useState(DEFAULT_MAX);
  const [cycleLabel, setCycleLabel] = useState('');
  const [rotationNum, setRotationNum] = useState('');
  const [tiers, setTiers] = useState<TierConfigRow[]>(DEFAULT_TIERS);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Phase1Result | null>(null);

  function updateTier(idx: number, field: keyof TierConfigRow, value: string) {
    setTiers(prev => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  }

  function addTier() {
    setTiers(prev => [...prev, { name: '', desiredGroups: '' }]);
  }

  function removeTier(idx: number) {
    setTiers(prev => prev.filter((_, i) => i !== idx));
  }

  function handleStart() {
    setLoading(true);
    setResult(null);

    const config = {
      groupSize: { min: minSize, max: maxSize },
      tiers: tiers
        .filter(t => t.name.trim())
        .map(t => ({
          name: t.name.trim(),
          ...(t.desiredGroups.trim() ? { desiredGroups: parseInt(t.desiredGroups, 10) } : {}),
        })),
      cycleLabel: cycleLabel.trim() || undefined,
      rotationNumber: rotationNum.trim() ? parseInt(rotationNum, 10) : undefined,
    };

    google.script.run
      .withSuccessHandler((res: Phase1Result) => {
        setResult(res);
        setLoading(false);
        if (res.success) onComplete();
      })
      .withFailureHandler((err: Error) => {
        setResult({ success: false, warnings: [err.message], scoresSheetName: '' });
        setLoading(false);
      })
      .startCycle(config);
  }

  const hasQueued = (summary?.queuedPlayers ?? 0) > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {hasQueued && (
        <div className="warnings">
          <h3>Heads up</h3>
          <ul>
            <li>
              {summary!.queuedPlayers} queued player(s) detected. Run Phase 2B (Activate Queued
              Players) first if you want them included in this rotation.
            </li>
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Rotation Settings</h2>
        <div className="form-row">
          <label>Cycle label</label>
          <input
            type="text"
            placeholder="e.g. Week (optional)"
            value={cycleLabel}
            onChange={e => setCycleLabel(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label>Rotation #</label>
          <input
            type="number"
            placeholder="e.g. 3 (optional)"
            value={rotationNum}
            min={1}
            onChange={e => setRotationNum(e.target.value)}
          />
        </div>
        <p className="hint">
          Sheet will be named: <em>{previewName(cycleLabel, rotationNum)}</em>
        </p>
      </div>

      <div className="card">
        <h2>Group Size</h2>
        <p className="hint">{HINT_SIZE}</p>
        <div className="form-row" style={{ marginTop: 8 }}>
          <label>Min players/group</label>
          <input
            type="number"
            value={minSize}
            min={2}
            max={maxSize}
            onChange={e => setMinSize(parseInt(e.target.value, 10))}
          />
        </div>
        <div className="form-row">
          <label>Max players/group</label>
          <input
            type="number"
            value={maxSize}
            min={minSize}
            onChange={e => setMaxSize(parseInt(e.target.value, 10))}
          />
        </div>
      </div>

      <div className="card">
        <h2>Tier Configuration</h2>
        <p className="hint">{HINT_GROUPS}</p>
        <table className="tier-table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Tier name</th>
              <th>Desired groups</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    type="text"
                    value={tier.name}
                    placeholder="e.g. S"
                    onChange={e => updateTier(idx, 'name', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={tier.desiredGroups}
                    placeholder="auto"
                    min={1}
                    onChange={e => updateTier(idx, 'desiredGroups', e.target.value)}
                  />
                </td>
                <td>
                  <button className="btn-icon" onClick={() => removeTier(idx)} title="Remove">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn-secondary btn-small" onClick={addTier}>
          + Add tier
        </button>
      </div>

      <div className="button-row">
        <button className="btn-primary" onClick={handleStart} disabled={loading}>
          {loading ? 'Running…' : 'Start Cycle (Phase 1)'}
        </button>
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner" />
          Generating groups and scores sheet…
        </div>
      )}

      {result && (
        <>
          {result.success ? (
            <div className="banner banner-success">
              Cycle started. Scores sheet: <strong>{result.scoresSheetName}</strong>
            </div>
          ) : (
            <div className="banner banner-error">Phase 1 failed — see warnings below.</div>
          )}
          <WarningList warnings={result.warnings} />
        </>
      )}
    </div>
  );
}

function previewName(label: string, num: string): string {
  const l = label.trim();
  const n = num.trim();
  if (!l && !n) return 'Scores';
  if (l && !n) return `Scores ${l}`;
  if (!l && n) return `Scores ${n}`;
  return `Scores ${l}-${n}`;
}
