import { LeagueConfig, Phase1Result } from './types';
import {
  readAllPlayers,
  writePlayerAssignments,
  writeCurrentScoresSheetName,
  findActiveScoresSheet,
  archiveScoresSheet,
  buildScoresSheetName,
} from './sheet-helpers';
import { distributeGroups } from './algorithm';
import { buildScoresSheet } from './scores-sheet';

/**
 * Phase 1 — Start a new rotation cycle.
 *
 * 1. Archive current Scores sheet → Prev Scores ...
 * 2. Run group distribution on ACTIVE players
 * 3. Generate new Scores sheet
 * 4. Write Wins Row / Losses Col back to Participants
 * 5. Write rotation number to Participants K1
 */
export function runPhase1(config: LeagueConfig): Phase1Result {
  const warnings: string[] = [];

  // Step 1: archive existing scores sheet
  const activeScores = findActiveScoresSheet();
  if (activeScores) {
    archiveScoresSheet(activeScores);
  }

  // Step 2: load players and run distribution
  const players = readAllPlayers();

  const queuedCount = players.filter(p => p.status === 'QUEUED').length;
  if (queuedCount > 0) {
    warnings.push(
      `${queuedCount} queued player(s) found. Run Phase 2B (Activate Queued Players) before ` +
        `starting a new cycle if you want them included in this rotation.`
    );
  }

  const result = distributeGroups(players, config.tiers, config.groupSize);
  warnings.push(...result.warnings);
  for (const tier of result.tiers) {
    warnings.push(...tier.warnings);
  }

  // Flatten all groups across all tiers
  const allGroups = result.tiers.flatMap(t => t.groups);

  // Step 3: build scores sheet
  const scoresSheetName = buildScoresSheetName(config.cycleLabel, config.rotationNumber);
  const assignments = buildScoresSheet(scoresSheetName, allGroups);

  // Step 4: write assignments back to Participants
  // Use tier/groupNumber from the distribution result (may differ for fill-promoted players)
  writePlayerAssignments(
    assignments.map(a => ({
      rowIndex: a.rowIndex,
      tier: a.tier,
      group: a.groupNumber,
      groupRank: a.player.groupRank,
      winsRow: a.winsRow,
      lossesCol: a.lossesCol,
    }))
  );

  // Step 5: write scores sheet name to K1 so the bot and operators can identify the current rotation
  writeCurrentScoresSheetName(scoresSheetName);

  return { success: true, warnings, scoresSheetName };
}
