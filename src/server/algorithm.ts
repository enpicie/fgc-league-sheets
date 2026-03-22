import {
  Player,
  TierConfig,
  GroupSizeConfig,
  Group,
  TierDistribution,
  DistributionResult,
} from './types';

/**
 * Group distribution algorithm (top-down, monotonicity-constrained).
 *
 * Phase 1 — resolve group count per tier:
 *   - Honour desired_groups if valid; warn and derive otherwise.
 *   - Monotonicity: each tier's group count >= tier above.
 *   - Fill promotion: if a tier is undersized after desired_groups
 *     validation, pull players from the tier below.
 *
 * Phase 2 — within-tier balancing:
 *   - Interleave players by current groupRank across groups
 *     (not chunked) so each group gets a mix of skill levels.
 */
export function distributeGroups(
  players: Player[],
  tiers: TierConfig[],
  groupSize: GroupSizeConfig
): DistributionResult {
  const globalWarnings: string[] = [];

  // Index active players by tier
  const playersByTier = new Map<string, Player[]>();
  for (const tier of tiers) {
    playersByTier.set(tier.name, []);
  }
  for (const p of players) {
    if (p.status !== 'ACTIVE') continue;
    if (playersByTier.has(p.tier)) {
      playersByTier.get(p.tier)!.push(p);
    } else {
      globalWarnings.push(
        `Player "${p.name}" has tier "${p.tier}" which is not in the tier config — skipped.`
      );
    }
  }

  // Pre-pass: fill promotion — pull from tier below to satisfy minimums
  for (let i = 0; i < tiers.length - 1; i++) {
    const tierName = tiers[i].name;
    const below = tiers[i + 1].name;
    const tierPlayers = playersByTier.get(tierName)!;
    const belowPlayers = playersByTier.get(below)!;
    const desired = tiers[i].desiredGroups;

    if (desired !== undefined) {
      const needed = desired * groupSize.min;
      while (tierPlayers.length < needed && belowPlayers.length > 0) {
        // Pull the top-ranked player from the tier below
        belowPlayers.sort((a, b) => a.groupRank - b.groupRank || a.group - b.group);
        const promoted = belowPlayers.shift()!;
        tierPlayers.push(promoted);
        globalWarnings.push(
          `Fill promotion: "${promoted.name}" moved from ${below} to ${tierName} to satisfy minimum group size.`
        );
      }
    }
  }

  // Phase 1 — resolve group counts
  const results: TierDistribution[] = [];
  let prevGroupCount = 0;

  for (const tierCfg of tiers) {
    const tierPlayers = playersByTier.get(tierCfg.name)!;
    const count = tierPlayers.length;
    const warnings: string[] = [];
    const fillPromotions: Player[] = [];

    let groupCount: number;

    if (tierCfg.desiredGroups !== undefined) {
      const minNeeded = tierCfg.desiredGroups * groupSize.min;
      const maxAllowed = tierCfg.desiredGroups * groupSize.max;
      if (count >= minNeeded && count <= maxAllowed) {
        groupCount = tierCfg.desiredGroups;
      } else {
        warnings.push(
          `Tier ${tierCfg.name}: desired_groups=${tierCfg.desiredGroups} is invalid ` +
            `for ${count} players (need ${minNeeded}–${maxAllowed}). Deriving instead.`
        );
        groupCount = deriveGroupCount(count, groupSize, prevGroupCount, tierCfg.name, warnings);
      }
    } else {
      groupCount = deriveGroupCount(count, groupSize, prevGroupCount, tierCfg.name, warnings);
    }

    // Enforce monotonicity
    if (groupCount < prevGroupCount) {
      warnings.push(
        `Tier ${tierCfg.name}: derived group count ${groupCount} is less than tier above (${prevGroupCount}). Raising to ${prevGroupCount}.`
      );
      groupCount = prevGroupCount;
    }

    prevGroupCount = groupCount;

    // Phase 2 — interleave players across groups by rank
    const groups = buildGroups(tierPlayers, groupCount, tierCfg.name);

    results.push({ tier: tierCfg.name, groupCount, groups, warnings, fillPromotions });
  }

  return { tiers: results, warnings: globalWarnings };
}

function deriveGroupCount(
  playerCount: number,
  groupSize: GroupSizeConfig,
  minAllowed: number,
  tierName: string,
  warnings: string[]
): number {
  if (playerCount === 0) return Math.max(minAllowed, 0);

  const minGroups = Math.max(Math.ceil(playerCount / groupSize.max), minAllowed);
  const maxGroups = Math.floor(playerCount / groupSize.min);

  if (minGroups > maxGroups) {
    warnings.push(
      `Tier ${tierName}: cannot form valid groups for ${playerCount} players with size ${groupSize.min}–${groupSize.max}. ` +
        `Using ${minGroups} group(s) — some may be undersized.`
    );
    return minGroups;
  }

  return minGroups; // fewest groups = largest groups = most competitive
}

/**
 * Interleave players across groups by their current groupRank.
 * Players are sorted by rank, then distributed round-robin.
 * This ensures each group has a similar skill mix.
 */
function buildGroups(
  players: Player[],
  groupCount: number,
  tierName: string
): Group[] {
  if (groupCount === 0) return [];

  // Sort by groupRank ascending (lower rank = higher placement)
  // Fall back to name for deterministic ordering of ties
  const sorted = [...players].sort(
    (a, b) => (a.groupRank || 9999) - (b.groupRank || 9999) || a.name.localeCompare(b.name)
  );

  const groups: Group[] = Array.from({ length: groupCount }, (_, i) => ({
    tier: tierName,
    groupNumber: i + 1,
    players: [],
  }));

  // Round-robin interleave (snake draft: 1,2,3,3,2,1,1,2,3,...)
  for (let i = 0; i < sorted.length; i++) {
    const groupIdx = i % groupCount;
    groups[groupIdx].players.push(sorted[i]);
  }

  return groups;
}
