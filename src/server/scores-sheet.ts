import { Group, Player } from './types';

// ── Column letter helper ──────────────────────────────────────────────────────
function col(n: number): string {
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

// ── Colours (matching the reference screenshot) ───────────────────────────────
const COLOUR = {
  TIER_HEADER_BG: '#f3f3f3',
  IN_PROGRESS: '#FFD966',     // yellow status pill
  COMPLETED: '#93C47D',       // green status pill
  GROUP_HEADER: '#EA9999',    // pink column-header / losses rows
  PLAYER_NAME: '#9FC5E8',     // blue player-name column
  WIN_PCT: '#B6D7A8',         // green Win% cells
  RANK: '#FFE599',            // gold Rank cells
  DIAGONAL: '#000000',        // black self-play cells
  WHITE: '#FFFFFF',
} as const;

/**
 * Build the score matrix sheet for a new rotation.
 *
 * Layout per group block
 * ──────────────────────────────────────────────────────────────────
 * Row 1  │ Tier │ In Progress (formula) │ Wins -> │ … │ Wins │ Played │ Win% │ Rank │
 * Row 2  │ Group N │ Player A │ Player B │ … │ Wins │ Played │ Win% │ Rank │   ← pink
 * Row 3+ │ Player A (blue) │ 0 │ ■ │ … │ =SUM │ =COUNTA │ =% │ =RANK │
 * …
 * Row N+3│ Losses (pink) │ =SUM col │ … │ Total │ Completion │ =% │   │
 * Row N+4│ (blank separator)
 *
 * Col layout:  1=label | 2..N+1=matrix | N+2=Wins | N+3=Played | N+4=Win% | N+5=Rank
 * All groups share the same column width (maxGroupSize).
 */
export function buildScoresSheet(
  sheetName: string,
  groups: Group[]
): Array<{
  rowIndex: number;
  player: Player;
  tier: string;
  groupNumber: number;
  winsRow: number;
  lossesCol: number;
}> {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const existing = ss.getSheetByName(sheetName);
  if (existing) ss.deleteSheet(existing);
  const sheet = ss.insertSheet(sheetName);

  const maxGroupSize = Math.max(...groups.map(g => g.players.length), 1);

  // Fixed column positions (1-based)
  const LABEL_COL = 1;
  const MATRIX_START = 2;
  const WINS_COL = maxGroupSize + 2;
  const PLAYED_COL = maxGroupSize + 3;
  const WIN_PCT_COL = maxGroupSize + 4;
  const RANK_COL = maxGroupSize + 5;
  const TOTAL_COLS = maxGroupSize + 5;

  const assignments: Array<{
    rowIndex: number;
    player: Player;
    tier: string;
    groupNumber: number;
    winsRow: number;
    lossesCol: number;
  }> = [];

  // Pre-compute total rows so we can allocate the value array once
  const rowsPerGroup = (n: number) => 4 + n; // tierHdr + colHdr + N players + losses + blank
  const totalRows = groups
    .filter(g => g.players.length > 0)
    .reduce((sum, g) => sum + rowsPerGroup(g.players.length), 0);

  if (totalRows === 0) return assignments;

  // Flat value array written in one batch; formula-only cells are written after
  const allValues: (string | number)[][] = Array.from({ length: totalRows }, () =>
    Array(TOTAL_COLS).fill('')
  );

  // Deferred formula writes: { row (1-based), col (1-based), formula }
  const formulas: Array<{ r: number; c: number; f: string }> = [];

  // Deferred formatting: { row (1-based), col (1-based), rows, cols, ...style }
  interface Fmt {
    r: number; c: number; rows: number; cols: number;
    bg?: string; fc?: string; bold?: boolean; fmt?: string; align?: 'center' | 'normal' | 'left' | 'right';
  }
  const fmts: Fmt[] = [];

  let sheetRow = 1; // current 1-based sheet row

  for (const group of groups) {
    const N = group.players.length;
    if (N === 0) continue;

    const tierHdrRow = sheetRow;
    const colHdrRow = sheetRow + 1;
    const playerStartRow = sheetRow + 2;
    const playerEndRow = sheetRow + 1 + N;
    const lossesRow = sheetRow + 2 + N;
    const blankRow = sheetRow + 3 + N;

    // Cell address helpers
    const A = (r: number, c: number) => `${col(c)}${r}`;
    const completionRef = A(lossesRow, WIN_PCT_COL);

    // ── Tier header row ───────────────────────────────────────────────────
    const th = allValues[tierHdrRow - 1];
    th[LABEL_COL - 1] = group.tier;
    // Col 2: "In Progress" / "Completed" — live formula (set below)
    th[2] = 'Wins ->';
    th[WINS_COL - 1] = 'Wins';
    th[PLAYED_COL - 1] = 'Played';
    th[WIN_PCT_COL - 1] = 'Win%';
    th[RANK_COL - 1] = 'Rank';

    formulas.push({ r: tierHdrRow, c: 2, f: `=IF(${completionRef}>=1,"Completed","In Progress")` });

    fmts.push({ r: tierHdrRow, c: 1, rows: 1, cols: TOTAL_COLS, bg: COLOUR.TIER_HEADER_BG, bold: true });
    // "In Progress" cell background: yellow (overwritten to green by the formula value, but we can't
    // dynamically change BG without conditional formatting — keep yellow as default)
    fmts.push({ r: tierHdrRow, c: 2, rows: 1, cols: 1, bg: COLOUR.IN_PROGRESS });

    // ── Group column-header row (pink) ────────────────────────────────────
    const ch = allValues[colHdrRow - 1];
    ch[LABEL_COL - 1] = `Group ${group.groupNumber}`;
    for (let pi = 0; pi < N; pi++) {
      ch[MATRIX_START - 1 + pi] = group.players[pi].name;
    }
    ch[WINS_COL - 1] = 'Wins';
    ch[PLAYED_COL - 1] = 'Played';
    ch[WIN_PCT_COL - 1] = 'Win%';
    ch[RANK_COL - 1] = 'Rank';

    fmts.push({ r: colHdrRow, c: 1, rows: 1, cols: TOTAL_COLS, bg: COLOUR.GROUP_HEADER, bold: true, align: 'center' });

    // ── Player rows ───────────────────────────────────────────────────────
    const winPctRange = `${col(WIN_PCT_COL)}${playerStartRow}:${col(WIN_PCT_COL)}${playerEndRow}`;
    // Actual matrix column range for this group (may be narrower than maxGroupSize)
    const matrixRangeEnd = col(MATRIX_START + N - 1);

    for (let pi = 0; pi < N; pi++) {
      const player = group.players[pi];
      const playerRow = playerStartRow + pi;
      const matrixRange = `${col(MATRIX_START)}${playerRow}:${matrixRangeEnd}${playerRow}`;

      // Static label
      allValues[playerRow - 1][LABEL_COL - 1] = player.name;

      // Matrix cells: leave empty — diagonal will just be black fill, no value

      // Stat formulas (written as a 4-element batch per row after static write)
      formulas.push({
        r: playerRow, c: WINS_COL,
        f: `=SUM(${matrixRange})`,
      });
      formulas.push({
        r: playerRow, c: PLAYED_COL,
        f: `=COUNTA(${matrixRange})`,
      });
      formulas.push({
        r: playerRow, c: WIN_PCT_COL,
        f: `=IFERROR(${col(WINS_COL)}${playerRow}/${col(PLAYED_COL)}${playerRow},0)`,
      });
      formulas.push({
        r: playerRow, c: RANK_COL,
        f: `=IF(${col(PLAYED_COL)}${playerRow}>0,RANK(${col(WIN_PCT_COL)}${playerRow},${winPctRange},0),"")`,
      });

      // Player name column: blue
      fmts.push({ r: playerRow, c: 1, rows: 1, cols: 1, bg: COLOUR.PLAYER_NAME, bold: true });

      // Diagonal cell: black
      const diagCol = MATRIX_START + pi;
      fmts.push({ r: playerRow, c: diagCol, rows: 1, cols: 1, bg: COLOUR.DIAGONAL });

      // Win% cell: green + percentage format
      fmts.push({ r: playerRow, c: WIN_PCT_COL, rows: 1, cols: 1, bg: COLOUR.WIN_PCT, fmt: '0.00%' });

      // Rank cell: gold
      fmts.push({ r: playerRow, c: RANK_COL, rows: 1, cols: 1, bg: COLOUR.RANK });

      // Record assignment for Participants write-back
      assignments.push({
        rowIndex: player.rowIndex,
        player,
        tier: group.tier,
        groupNumber: group.groupNumber,
        winsRow: playerRow,
        lossesCol: MATRIX_START + pi, // this player is opponent column (MATRIX_START + pi)
      });
    }

    // ── Losses footer row (pink) ──────────────────────────────────────────
    const lv = allValues[lossesRow - 1];
    lv[LABEL_COL - 1] = 'Losses';
    lv[WINS_COL - 1] = 'Total';
    lv[PLAYED_COL - 1] = 'Completion';

    // Column-sum formulas for each player's losses
    for (let pi = 0; pi < N; pi++) {
      const playerCol = MATRIX_START + pi;
      formulas.push({
        r: lossesRow, c: playerCol,
        f: `=SUM(${col(playerCol)}${playerStartRow}:${col(playerCol)}${playerEndRow})`,
      });
    }

    // Completion %: COUNTA(matrix) / N*(N-1)
    const totalPossible = N * (N - 1);
    const fullMatrixRange = `${col(MATRIX_START)}${playerStartRow}:${matrixRangeEnd}${playerEndRow}`;
    formulas.push({
      r: lossesRow, c: WIN_PCT_COL,
      f: totalPossible > 0
        ? `=IFERROR(COUNTA(${fullMatrixRange})/${totalPossible},0)`
        : '0',
    });

    fmts.push({ r: lossesRow, c: 1, rows: 1, cols: TOTAL_COLS, bg: COLOUR.GROUP_HEADER, bold: true });
    fmts.push({ r: lossesRow, c: WIN_PCT_COL, rows: 1, cols: 1, fmt: '0.00%' });

    sheetRow = blankRow + 1;
  }

  // ── Batch write static values ─────────────────────────────────────────────
  sheet.getRange(1, 1, totalRows, TOTAL_COLS).setValues(allValues);

  // ── Write formulas (batch by row where possible) ──────────────────────────
  // Group consecutive formulas in the same row into one setFormulas call
  const byRow = new Map<number, Array<{ c: number; f: string }>>();
  for (const entry of formulas) {
    if (!byRow.has(entry.r)) byRow.set(entry.r, []);
    byRow.get(entry.r)!.push({ c: entry.c, f: entry.f });
  }
  for (const [r, entries] of byRow) {
    // Sort by column
    entries.sort((a, b) => a.c - b.c);
    // Write contiguous runs as single setFormulas calls
    let i = 0;
    while (i < entries.length) {
      let j = i;
      while (j + 1 < entries.length && entries[j + 1].c === entries[j].c + 1) j++;
      const formulaRow = entries.slice(i, j + 1).map(e => e.f);
      sheet.getRange(r, entries[i].c, 1, formulaRow.length).setFormulas([formulaRow]);
      i = j + 1;
    }
  }

  // ── Apply formatting ───────────────────────────────────────────────────────
  for (const fmt of fmts) {
    const range = sheet.getRange(fmt.r, fmt.c, fmt.rows, fmt.cols);
    if (fmt.bg) range.setBackground(fmt.bg);
    if (fmt.fc) range.setFontColor(fmt.fc);
    if (fmt.bold !== undefined) range.setFontWeight(fmt.bold ? 'bold' : 'normal');
    if (fmt.fmt) range.setNumberFormat(fmt.fmt);
    if (fmt.align) range.setHorizontalAlignment(fmt.align);
  }

  // Centre matrix and stat cells
  sheet.getRange(1, MATRIX_START, totalRows, TOTAL_COLS - 1).setHorizontalAlignment('center');

  // Freeze label column; no row freeze (each group has its own header rows)
  sheet.setFrozenColumns(1);
  sheet.setFrozenRows(0);

  sheet.autoResizeColumns(1, TOTAL_COLS);

  return assignments;
}

// ── Read score results ────────────────────────────────────────────────────────

/**
 * Read computed scores from the sheet.
 *
 * Scans for group-header rows ("Group N" in col 1).
 * Uses the tier-header row (one row above the group header) to find the
 * "Wins" column, then reads Wins + Played from the formula-computed values.
 */
export function readScoreMatrix(scoresSheetName: string): Map<
  string,
  { wins: number; losses: number; total: number; winPct: number; incomplete: boolean }
> {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(scoresSheetName);
  if (!sheet) throw new Error(`Sheet "${scoresSheetName}" not found.`);

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return new Map();

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues() as (string | number)[][];
  const results = new Map<
    string,
    { wins: number; losses: number; total: number; winPct: number; incomplete: boolean }
  >();

  for (let r = 0; r < data.length; r++) {
    const label = String(data[r][0] ?? '').trim();

    // Group header row: "Group N"
    if (!/^Group \d+$/.test(label)) continue;

    // Tier header is the row immediately above
    if (r === 0) continue;
    const tierHdr = data[r - 1];

    // Find "Wins" column index (0-based) in the tier header
    const winsIdx = tierHdr.findIndex(c => String(c).trim() === 'Wins');
    if (winsIdx < 0) continue;
    const playedIdx = winsIdx + 1; // Played is always right after Wins

    // Count actual players: non-empty cells between col index 1 and winsIdx-1
    let N = 0;
    for (let c = 1; c < winsIdx; c++) {
      if (String(data[r][c] ?? '').trim() !== '') N++;
    }
    if (N === 0) continue;

    // Read each player row
    for (let pi = 0; pi < N; pi++) {
      const pr = r + 1 + pi;
      if (pr >= data.length) break;
      const playerRow = data[pr];
      const playerName = String(playerRow[0] ?? '').trim();
      if (!playerName || playerName === 'Losses') break;

      const wins = Number(playerRow[winsIdx]) || 0;
      const played = Number(playerRow[playedIdx]) || 0;
      const winPct = played > 0 ? wins / played : 0;
      // Incomplete = hasn't played all N-1 opponents yet
      const incomplete = played < N - 1;

      results.set(playerName, {
        wins,
        losses: played - wins,
        total: played,
        winPct,
        incomplete,
      });
    }
  }

  return results;
}
