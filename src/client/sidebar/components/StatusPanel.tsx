import React from 'react';
import { RotationSummary } from '../types';

interface Props {
  summary: RotationSummary | null;
  loading: boolean;
  onRefresh: () => void;
}

export default function StatusPanel({ summary, loading, onRefresh }: Props) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2>Current State</h2>
        <button className="btn-secondary btn-small" onClick={onRefresh} disabled={loading}>
          {loading ? '...' : 'Refresh'}
        </button>
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner" />
          Loading...
        </div>
      )}

      {!loading && summary && (
        <div className="status-grid">
          <span className="label">Rotation #</span>
          <span className="value">{summary.rotationNumber ?? '—'}</span>

          <span className="label">Scores sheet</span>
          <span className="value" style={{ fontSize: 11 }}>{summary.scoresSheetName ?? '—'}</span>

          <span className="label">Active players</span>
          <span className="value">{summary.activePlayers}</span>

          <span className="label">Queued</span>
          <span className="value"
            style={{ color: summary.queuedPlayers > 0 ? '#ea8600' : undefined }}>
            {summary.queuedPlayers}
          </span>

          <span className="label">DNF</span>
          <span className="value"
            style={{ color: summary.dnfPlayers > 0 ? '#d93025' : undefined }}>
            {summary.dnfPlayers}
          </span>

          <span className="label">Tiers</span>
          <span className="value">{summary.tiers.join(', ') || '—'}</span>
        </div>
      )}

      {!loading && !summary && (
        <p style={{ fontSize: 12, color: '#5f6368' }}>Could not load state. Is the Participants sheet present?</p>
      )}
    </div>
  );
}
