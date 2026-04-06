import { Phase2AResult, Phase2BResult } from './types';
import {
  readAllPlayers,
  writePlayerStatuses,
  writeGroupRanks,
  findActiveScoresSheet,
  backupParticipants,
} from './sheet-helpers';
import { readScoreMatrix, readHeadToHeadMap } from './scores-sheet';

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
  commit = false,
  promoteOverrides: Record<string, number> = {},
  demoteOverrides: Record<string, number> = {},
  matchesPerSet = 1
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

  const allPlayers = readAllPlayers().filter(p => p.status === 'ACTIVE');
  const scoreMap = readScoreMatrix(scoresSheet.getName(), matchesPerSet);
  const h2h = readHeadToHeadMap(scoresSheet.getName());

  // Flag DNF players — ACTIVE players with incomplete rows in the score matrix
  const incompletePlayers = allPlayers.filter(p => {
    const score = scoreMap.get(p.name);
    return score?.incomplete ?? false;
  });

  // Pair each DNF player with their demotion target (tier below, or same if already at bottom)
  const dnfPlayers = incompletePlayers.map(p => {
    const tierIdx = tierOrder.indexOf(p.tier);
    const toTier = tierIdx >= 0 && tierIdx < tierOrder.length - 1
      ? tierOrder[tierIdx + 1]
      : p.tier;
    return { player: p, toTier };
  });

  if (dnfPlayers.length > 0) {
    warnings.push(
      `${dnfPlayers.length} player(s) have incomplete match results and will be marked DNF: ` +
        dnfPlayers.map(({ player, toTier }) =>
          toTier !== player.tier ? `${player.name} (${player.tier} → ${toTier})` : player.name
        ).join(', ')
    );
  }

  // Group active (non-DNF) players by tier and group — exclude returning DNF too
  type GroupKey = string; // "Tier:GroupNumber"
  const groups = new Map<GroupKey, typeof allPlayers[0][]>();

  const dnfSet = new Set(dnfPlayers.map(d => d.player));
  for (const p of allPlayers) {
    if (dnfSet.has(p)) continue;
    const key = `${p.tier}:${p.group}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const promotions: Phase2AResult['promotions'] = [];
  const demotions: Phase2AResult['demotions'] = [];
  const rankUpdates: Array<{ rowIndex: number; groupRank: number }> = [];

  for (const [key, groupPlayers] of groups) {
    const [tierName] = key.split(':');
    const tierIdx = tierOrder.indexOf(tierName);
    if (tierIdx === -1) continue;

    const aboveTier = tierIdx > 0 ? tierOrder[tierIdx - 1] : null;
    const belowTier = tierIdx < tierOrder.length - 1 ? tierOrder[tierIdx + 1] : null;

    // Sort by win percentage descending.
    // Ties broken by head-to-head record, then alphabetically.
    const ranked = [...groupPlayers].sort((a, b) => {
      const sa = scoreMap.get(a.name)?.winPct ?? 0;
      const sb = scoreMap.get(b.name)?.winPct ?? 0;
      if (sb !== sa) return sb - sa;
      // Head-to-head: player with more wins over the other ranks higher
      const aOverB = h2h.get(a.name)?.get(b.name) ?? 0;
      const bOverA = h2h.get(b.name)?.get(a.name) ?? 0;
      if (aOverB !== bOverA) return bOverA - aOverB;
      return a.name.localeCompare(b.name);
    });

    // Record finish rank for every player in this group (1 = best)
    for (let i = 0; i < ranked.length; i++) {
      rankUpdates.push({ rowIndex: ranked[i].rowIndex, groupRank: i + 1 });
    }

    const effectivePromote = promoteOverrides[tierName] ?? promoteCount;
    const effectiveDemote = demoteOverrides[tierName] ?? demoteCount;

    // Top N promote
    if (aboveTier !== null) {
      for (let i = 0; i < Math.min(effectivePromote, ranked.length); i++) {
        promotions.push({ player: ranked[i], fromTier: tierName, toTier: aboveTier });
      }
    }

    // Bottom N demote
    if (belowTier !== null) {
      const start = Math.max(ranked.length - effectiveDemote, effectivePromote);
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

    const statusUpdates: Array<{ rowIndex: number; status: 'ACTIVE' | 'DNF'; tier?: string; group?: number; groupRank?: number }> = [];

    for (const { player, toTier } of dnfPlayers) {
      statusUpdates.push({ rowIndex: player.rowIndex, status: 'DNF', tier: toTier, group: 0, groupRank: 0 });
    }
    for (const { player, toTier } of promotions) {
      statusUpdates.push({ rowIndex: player.rowIndex, status: 'ACTIVE', tier: toTier });
    }
    for (const { player, toTier } of demotions) {
      statusUpdates.push({ rowIndex: player.rowIndex, status: 'ACTIVE', tier: toTier });
    }

    writePlayerStatuses(statusUpdates);
    writeGroupRanks(rankUpdates);
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
