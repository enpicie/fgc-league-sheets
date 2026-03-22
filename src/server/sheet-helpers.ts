import { COL, Player, PlayerStatus, RotationSummary } from './types';

const PARTICIPANTS_SHEET = 'Participants';

export function getParticipantsSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PARTICIPANTS_SHEET);
  if (!sheet) throw new Error('Participants sheet not found.');
  return sheet;
}

export function readAllPlayers(): Player[] {
  const sheet = getParticipantsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, COL.LOSSES_COL).getValues();
  const players: Player[] = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const name = String(row[COL.NAME - 1] ?? '').trim();
    if (!name) continue;

    players.push({
      rowIndex: i + 2,
      status: String(row[COL.STATUS - 1]).trim() as PlayerStatus,
      discordId: String(row[COL.DISCORD_ID - 1] ?? '').trim(),
      name,
      tier: String(row[COL.TIER - 1] ?? '').trim(),
      group: Number(row[COL.GROUP - 1]) || 0,
      groupRank: Number(row[COL.GROUP_RANK - 1]) || 0,
      notes: String(row[COL.NOTES - 1] ?? '').trim(),
      winsRow: Number(row[COL.WINS_ROW - 1]) || 0,
      lossesCol: Number(row[COL.LOSSES_COL - 1]) || 0,
    });
  }
  return players;
}

function colIndexToLetter(n: number): string {
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

export function writePlayerAssignments(
  players: Array<{
    rowIndex: number;
    tier: string;
    group: number;
    groupRank: number;
    winsRow: number;
    lossesCol: number;
  }>
): void {
  const sheet = getParticipantsSheet();
  for (const p of players) {
    // Batch: Tier/Group/GroupRank are contiguous cols 4-6
    sheet.getRange(p.rowIndex, COL.TIER, 1, 3).setValues([[p.tier, p.group, p.groupRank]]);
    // Batch: WinsRow/LossesCol are contiguous cols 8-9
    sheet.getRange(p.rowIndex, COL.WINS_ROW, 1, 2).setValues([[p.winsRow, colIndexToLetter(p.lossesCol)]]);
  }
}

export function writePlayerStatuses(
  updates: Array<{ rowIndex: number; status: PlayerStatus; tier?: string }>
): void {
  const sheet = getParticipantsSheet();
  for (const u of updates) {
    sheet.getRange(u.rowIndex, COL.STATUS).setValue(u.status);
    if (u.tier !== undefined) {
      sheet.getRange(u.rowIndex, COL.TIER).setValue(u.tier);
    }
  }
}

export function writeCurrentScoresSheetName(sheetName: string): void {
  const sheet = getParticipantsSheet();
  sheet.getRange(1, COL.ROTATION_LABEL).setValue('Current Rotation:');
  sheet.getRange(1, COL.ROTATION_VALUE).setValue(sheetName);
}


/** Build the Scores sheet name from optional label and rotation number. */
export function buildScoresSheetName(
  cycleLabel?: string,
  rotationNumber?: number
): string {
  const label = cycleLabel?.trim() ?? '';
  const hasLabel = label.length > 0;
  const hasNum = rotationNumber !== undefined && rotationNumber !== null;

  if (!hasLabel && !hasNum) return 'Scores';
  if (hasLabel && !hasNum) return `Scores ${label}`;
  if (!hasLabel && hasNum) return `Scores ${rotationNumber}`;
  return `Scores ${label}-${rotationNumber}`;
}

/** Find the current active Scores sheet (any sheet starting with "Scores" but not "Prev"). */
export function findActiveScoresSheet(): GoogleAppsScript.Spreadsheet.Sheet | null {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  for (const sheet of ss.getSheets()) {
    const name = sheet.getName();
    if (name.startsWith('Scores') && !name.startsWith('Prev ')) {
      return sheet;
    }
  }
  return null;
}

export function archiveScoresSheet(
  sheet: GoogleAppsScript.Spreadsheet.Sheet
): void {
  sheet.setName(`Prev ${sheet.getName()}`);
}

// ── Participants backup / rollback ────────────────────────────────────────────

const BACKUP_SHEET = '_ParticipantsBackup';

/**
 * Copy the Participants sheet to a hidden backup sheet.
 * Any previous backup is deleted first.
 * Called automatically before Phase 2A commit so operators can rollback.
 */
export function backupParticipants(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const participants = ss.getSheetByName(PARTICIPANTS_SHEET);
  if (!participants) return;

  const old = ss.getSheetByName(BACKUP_SHEET);
  if (old) ss.deleteSheet(old);

  const backup = participants.copyTo(ss);
  backup.setName(BACKUP_SHEET);
  backup.hideSheet();
}

/** Returns true if a Participants backup exists. */
export function hasParticipantsBackup(): boolean {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(BACKUP_SHEET) !== null;
}

/**
 * Overwrite Participants with the last saved backup.
 * Restores values only (no formatting recovery needed — formatting is static).
 */
export function restoreParticipantsFromBackup(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const backup = ss.getSheetByName(BACKUP_SHEET);
  if (!backup) throw new Error('No backup found — nothing to rollback.');

  const participants = getParticipantsSheet();

  const lastRow = backup.getLastRow();
  const lastCol = backup.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return;

  const values = backup.getRange(1, 1, lastRow, lastCol).getValues();

  // Clear any extra rows that may exist in the live sheet beyond the backup
  participants.clearContents();
  participants.getRange(1, 1, lastRow, lastCol).setValues(values);
}

export function getRotationSummary(): RotationSummary {
  const players = readAllPlayers();
  const activeScores = findActiveScoresSheet();

  const tiers = [...new Set(
    players.filter(p => p.status === 'ACTIVE').map(p => p.tier).filter(Boolean)
  )].sort();

  return {
    scoresSheetName: activeScores?.getName() ?? null,
    activePlayers: players.filter(p => p.status === 'ACTIVE').length,
    queuedPlayers: players.filter(p => p.status === 'QUEUED').length,
    dnfPlayers: players.filter(p => p.status === 'DNF').length,
    tiers,
  };
}
