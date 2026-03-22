import { Phase2AResult, Phase2BResult } from './types';
import {
  readAllPlayers,
  writePlayerStatuses,
  findActiveScoresSheet,
  backupParticipants,
} from './sheet-helpers';
import { readScoreMatrix } from './scores-sheet';

/**
 * Phase 2A — Calculate promotions and demotions from current rotation results.
 *
 * @param tierOrder  Ordered tier names top-to-bottom, e.g. ['S','A','B','C','D'].
 * @param promoteCount  How many top players from each tier promote up (default 1).
 * @param demoteCount   How many bottom players from each tier demote down (default 1).
 * @param commit  If false, returns a preview without writing anything to the sheet.
 */
export function runPhase2A(
  tierOrder: string[],
  promoteCount = 1,
  demoteCount = 1,
  commit = false
): Phase2AResult {
  const warnings: string[] = [];

  const scoresSheet = findActiveScoresSheet();
  if (!scoresSheet) {
    return {
      success: false,
      warnings: ['No active Scores sheet found. Cannot calculate results.'],
      promotions: [],
      demotions: [],
      dnfPlayers: [],
      preview: !commit,
    };
  }

  const players = readAllPlayers().filter(p => p.status === 'ACTIVE' || p.status === 'DNF');
  const scoreMap = readScoreMatrix(scoresSheet.getName());

  // Flag DNF players — those with incomplete rows in the score matrix
  const dnfPlayers = players.filter(p => {
    const score = scoreMap.get(p.name);
    return score?.incomplete ?? false;
  });

  if (dnfPlayers.length > 0) {
    warnings.push(
      `${dnfPlayers.length} player(s) have incomplete match results and will be marked DNF: ` +
        dnfPlayers.map(p => p.name).join(', ')
    );
  }

  // Group active (non-DNF) players by tier and group
  type GroupKey = string; // "Tier:GroupNumber"
  const groups = new Map<GroupKey, typeof players[0][]>();

  for (const p of players) {
    if (dnfPlayers.includes(p)) continue;
    const key = `${p.tier}:${p.group}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const promotions: Phase2AResult['promotions'] = [];
  const demotions: Phase2AResult['demotions'] = [];

  for (const [key, groupPlayers] of groups) {
    const [tierName] = key.split(':');
    const tierIdx = tierOrder.indexOf(tierName);
    if (tierIdx === -1) continue;

    const aboveTier = tierIdx > 0 ? tierOrder[tierIdx - 1] : null;
    const belowTier = tierIdx < tierOrder.length - 1 ? tierOrder[tierIdx + 1] : null;

    // Sort by win percentage descending, then by name for tie-breaking
    const ranked = [...groupPlayers].sort((a, b) => {
      const sa = scoreMap.get(a.name)?.winPct ?? 0;
      const sb = scoreMap.get(b.name)?.winPct ?? 0;
      if (sb !== sa) return sb - sa;
      return a.name.localeCompare(b.name);
    });

    // Top N promote
    if (aboveTier !== null) {
      for (let i = 0; i < Math.min(promoteCount, ranked.length); i++) {
        promotions.push({ player: ranked[i], fromTier: tierName, toTier: aboveTier });
      }
    }

    // Bottom N demote
    if (belowTier !== null) {
      const start = Math.max(ranked.length - demoteCount, promoteCount);
      for (let i = start; i < ranked.length; i++) {
        // Don't demote someone who is also being promoted (edge case: tiny groups)
        if (!promotions.find(x => x.player === ranked[i])) {
          demotions.push({ player: ranked[i], fromTier: tierName, toTier: belowTier });
        }
      }
    }
  }

  if (commit) {
    // Snapshot Participants before any writes so the operator can rollback
    backupParticipants();

    const statusUpdates: Array<{ rowIndex: number; status: 'ACTIVE' | 'DNF'; tier?: string }> = [];

    for (const p of dnfPlayers) {
      statusUpdates.push({ rowIndex: p.rowIndex, status: 'DNF' });
    }
    for (const { player, toTier } of promotions) {
      statusUpdates.push({ rowIndex: player.rowIndex, status: 'ACTIVE', tier: toTier });
    }
    for (const { player, toTier } of demotions) {
      statusUpdates.push({ rowIndex: player.rowIndex, status: 'ACTIVE', tier: toTier });
    }

    writePlayerStatuses(statusUpdates);
  }

  return {
    success: true,
    warnings,
    promotions,
    demotions,
    dnfPlayers,
    preview: !commit,
  };
}

/**
 * Phase 2B — Activate all QUEUED players.
 * Moves them to ACTIVE status. They will be sorted into groups on next Phase 1 run.
 */
export function runPhase2B(): Phase2BResult {
  const players = readAllPlayers();
  const queued = players.filter(p => p.status === 'QUEUED');

  if (queued.length === 0) {
    return { success: true, activatedPlayers: [] };
  }

  writePlayerStatuses(queued.map(p => ({ rowIndex: p.rowIndex, status: 'ACTIVE' })));

  return { success: true, activatedPlayers: queued };
}
