/**
 * Google Apps Script entry point.
 * All functions called from the client sidebar must be declared global here.
 */
import { LeagueConfig, Phase1Result, Phase2AResult, Phase2BResult, RollbackResult, RotationSummary } from './types';
import { getRotationSummary, hasParticipantsBackup, restoreParticipantsFromBackup } from './sheet-helpers';
import { runPhase1 } from './phase1';
import { runPhase2A, runPhase2B } from './phase2';

// ── Menu ─────────────────────────────────────────────────────────────────────

declare const global: Record<string, unknown>;

global.onOpen = function (): void {
  SpreadsheetApp.getUi()
    .createMenu('League Manager')
    .addItem('Open Sidebar', 'openSidebar')
    .addToUi();
};

global.openSidebar = function (): void {
  const html = HtmlService.createHtmlOutputFromFile('sidebar')
    .setTitle('League Manager')
    .setWidth(400);
  SpreadsheetApp.getUi().showSidebar(html);
};

// ── Server-callable functions (called via google.script.run) ─────────────────

global.getRotationSummary = function (): RotationSummary {
  return getRotationSummary();
};

global.startCycle = function (config: LeagueConfig): Phase1Result {
  try {
    return runPhase1(config);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, warnings: [msg], scoresSheetName: '' };
  }
};

global.previewEndCycle = function (
  tierOrder: string[],
  promoteCount: number,
  demoteCount: number
): Phase2AResult {
  try {
    return runPhase2A(tierOrder, promoteCount, demoteCount, false);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, warnings: [msg], promotions: [], demotions: [], dnfPlayers: [], preview: true };
  }
};

global.commitEndCycle = function (
  tierOrder: string[],
  promoteCount: number,
  demoteCount: number
): Phase2AResult {
  try {
    return runPhase2A(tierOrder, promoteCount, demoteCount, true);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, warnings: [msg], promotions: [], demotions: [], dnfPlayers: [], preview: false };
  }
};

global.activateQueuedPlayers = function (): Phase2BResult {
  try {
    return runPhase2B();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, activatedPlayers: [] };
  }
};

global.hasRollbackData = function (): boolean {
  return hasParticipantsBackup();
};

global.rollbackEndCycle = function (): RollbackResult {
  try {
    restoreParticipantsFromBackup();
    return { success: true, message: 'Participants restored from backup. Promotions/demotions have been reversed.' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg };
  }
};
