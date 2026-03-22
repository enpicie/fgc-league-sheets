// ── Sheet column indices (1-based) ───────────────────────────────────────────
export const COL = {
  STATUS: 1,
  DISCORD_ID: 2,
  NAME: 3,
  TIER: 4,
  GROUP: 5,
  GROUP_RANK: 6,
  NOTES: 7,
  WINS_ROW: 8,
  LOSSES_COL: 9,
  ROTATION_LABEL: 10, // J1: "Current Rotation:"
  ROTATION_VALUE: 11, // K1: integer rotation number
} as const;

export type PlayerStatus = 'ACTIVE' | 'QUEUED' | 'DNF' | 'INACTIVE';

export interface Player {
  rowIndex: number; // 1-based sheet row
  status: PlayerStatus;
  discordId: string;
  name: string;
  tier: string;
  group: number;
  groupRank: number;
  notes: string;
  winsRow: number;
  lossesCol: number;
}

export interface TierConfig {
  name: string;
  desiredGroups?: number;
}

export interface GroupSizeConfig {
  min: number;
  max: number;
}

export interface LeagueConfig {
  groupSize: GroupSizeConfig;
  tiers: TierConfig[];
  cycleLabel?: string;
  rotationNumber?: number;
}

export interface Group {
  tier: string;
  groupNumber: number; // 1-based within tier
  players: Player[];
}

export interface TierDistribution {
  tier: string;
  groupCount: number;
  groups: Group[];
  warnings: string[];
  fillPromotions: Player[]; // players pulled up from tier below
}

export interface DistributionResult {
  tiers: TierDistribution[];
  warnings: string[];
}

export interface Phase1Result {
  success: boolean;
  warnings: string[];
  scoresSheetName: string;
}

export interface Phase2AResult {
  success: boolean;
  warnings: string[];
  promotions: Array<{ player: Player; fromTier: string; toTier: string }>;
  demotions: Array<{ player: Player; fromTier: string; toTier: string }>;
  dnfPlayers: Player[];
  preview: boolean;
}

export interface Phase2BResult {
  success: boolean;
  activatedPlayers: Player[];
}

export interface RollbackResult {
  success: boolean;
  message: string;
}

export interface RotationSummary {
  scoresSheetName: string | null;
  activePlayers: number;
  queuedPlayers: number;
  dnfPlayers: number;
  tiers: string[];
}
