export type PlayerStatus = 'ACTIVE' | 'QUEUED' | 'DNF' | 'INACTIVE';

export interface TierConfigRow {
  name: string;
  desiredGroups: string; // string so empty = unset
}

export interface RotationSummary {
  scoresSheetName: string | null;
  activePlayers: number;
  queuedPlayers: number;
  dnfPlayers: number;
  tiers: string[];
}

export interface Phase1Result {
  success: boolean;
  warnings: string[];
  scoresSheetName: string;
}

export interface PlayerRef {
  rowIndex: number;
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

export interface Phase2AResult {
  success: boolean;
  warnings: string[];
  promotions: Array<{ player: PlayerRef; fromTier: string; toTier: string }>;
  demotions: Array<{ player: PlayerRef; fromTier: string; toTier: string }>;
  dnfPlayers: PlayerRef[];
  preview: boolean;
}

export interface Phase2BResult {
  success: boolean;
  activatedPlayers: PlayerRef[];
}

export interface RollbackResult {
  success: boolean;
  message: string;
}
