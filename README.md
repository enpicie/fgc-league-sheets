# fgc-league-sheets

Google Sheets extension (Apps Script add-on) for managing a tiered FGC league system. Handles group distribution, rotation cycle management, score matrix generation, and promotion/demotion calculations.

A companion Discord bot (`adomi-san-bot`) can report scores directly to the sheet, but the extension is fully usable with manual score entry. They share a **sheet contract** (column layout, sheet naming) but not code.

---

## Features

- **Phase 1 — Start Cycle:** archives the previous scores sheet, runs the group distribution algorithm, generates a new score matrix, and writes player positions back to the Participants sheet.
- **Phase 2A — End Cycle:** reads win% from the current scores sheet, flags DNF players, and calculates promotions/demotions. Supports a preview mode before committing changes.
- **Phase 2B — Activate Queued Players:** promotes queued players to active so they are included in the next Phase 1 run.
- **Group distribution algorithm:** top-down, monotonicity-constrained. Supports optional `desired_groups` per tier with automatic fallback and fill-promotion from the tier below.
- **Sidebar UI:** React sidebar with live state display, tier configuration, and per-phase controls.

---

## Sheet Contract

Both this extension and `adomi-san-bot` depend on this layout. Do not rename columns.

### Participants Sheet

Row 1 is the header row. Data starts at row 2.

| Col | Header | Notes |
|-----|--------|-------|
| A | `Status` | `ACTIVE`, `QUEUED`, `DNF`, or `INACTIVE` |
| B | `Discord ID (@)` | Discord handle for bot lookups |
| C | `Participant Name` | Display name used in score matrix |
| D | `Tier` | Current tier assignment |
| E | `Group #` | Group within tier |
| F | `Group Rank` | Rank within group (used for seeding next rotation) |
| G | `Notes` | Operator notes |
| H | `Wins Row` | Sheet row in current scores matrix (written by extension) |
| I | `Losses Col` | Sheet column in current scores matrix (written by extension) |
| J | `Current Rotation:` | Label — do not change |
| K | *(rotation value)* | Integer rotation number (written by extension) |

### Scores Sheet Naming

| Parameters | Sheet name |
|------------|------------|
| Neither | `Scores` |
| Label only (`Week`) | `Scores Week` |
| Number only (`3`) | `Scores 3` |
| Both | `Scores Week-3` |

On archive (Phase 1), `Prev ` is prepended: `Prev Scores Week-3`.

### Score Matrix Layout

- Row 1: header (`Tier`, `Group`, `Player`, then opponent names)
- Each group: one header row + one row per player + one blank separator row
- Cell `[wins_row, losses_col]` = number of wins that row-player has over col-player
- Diagonal cells = `—` (self-play)
- Frozen: row 1 (header), columns 1–3 (Tier, Group, Player)

---

## Local Development

**Prerequisites:** Node.js 18+, a Google account, `clasp` CLI.

```bash
# Install dependencies
npm install

# Log in to clasp (one-time)
npx clasp login

# Create a new Apps Script project bound to a Google Sheet
# Open the sheet, then Extensions → Apps Script, copy the script ID from the URL
# Update .clasp.json with the script ID

# Or create a standalone script:
npx clasp create --type sheets --title "FGC League Manager"

# Build and push to Apps Script
npm run push

# Watch mode (rebuilds on save, you still need to push manually)
npm run watch
```

### Project Structure

```
src/
  server/             # Apps Script (GAS) server-side code
    index.ts          # onOpen menu, global function declarations
    types.ts          # Shared TypeScript types
    sheet-helpers.ts  # Participants sheet read/write helpers
    scores-sheet.ts   # Score matrix builder and reader
    algorithm.ts      # Group distribution algorithm
    phase1.ts         # Start Cycle logic
    phase2.ts         # End Cycle logic (promotions, DNF, activate)
  client/
    sidebar/          # React sidebar
      App.tsx         # Root component with tab navigation
      components/     # StatusPanel, Phase1Panel, Phase2Panel, WarningList
      styles.css      # Sidebar stylesheet
      index.html      # Sidebar HTML shell
      index.tsx       # React entry point
dist/                 # Webpack output — what clasp pushes
  Code.js
  sidebar.html
appsscript.json       # Apps Script manifest
.clasp.json           # clasp config (update scriptId before pushing)
```

---

## CI/CD (GitHub Actions)

On every push to `main`, the workflow:
1. Installs dependencies
2. Runs `npm run build` (webpack)
3. Writes clasp credentials from the `CLASP_TOKEN` secret
4. Pushes to Apps Script with `clasp push --force`
5. Creates a version snapshot

### Setup

1. On your machine, run `npx clasp login` and copy the contents of `~/.clasprc.json`.
2. In your GitHub repo → **Settings → Secrets and variables → Actions**, create a secret named `CLASP_TOKEN` with that JSON as the value.
3. Update `.clasp.json` with your Apps Script `scriptId`.
4. Push to `main` — the workflow deploys automatically.

> **Important:** `clasp push` is destructive. The repo is the source of truth. Never edit the script in the browser editor.

---

## Group Distribution Algorithm

**Input:**
```json
{
  "groupSize": { "min": 4, "max": 8 },
  "tiers": [
    { "name": "S", "desiredGroups": 1 },
    { "name": "A" },
    { "name": "B" },
    { "name": "C" },
    { "name": "D" }
  ]
}
```

**Phase 1 — Resolve group counts (top-down):**
- If `desiredGroups` is set and valid (`desiredGroups × min ≤ players ≤ desiredGroups × max`), use it.
- Otherwise derive: `min_groups = ceil(players / max_size)`, pick the fewest groups (largest groups = most competitive).
- **Monotonicity constraint:** each tier's group count ≥ the tier above it.
- **Fill promotion:** if a tier is undersized after locking, pull top-ranked players from the tier below. These players may revert next rotation.

**Phase 2 — Within-tier group balancing:**
- Sort players by `Group Rank` ascending, then interleave round-robin across groups.
- This gives each group a mix of rankings rather than chunking top/bottom players together.

---

## Promotion / Demotion Rules

- After a rotation, win% is calculated per player: `wins / (wins + losses)`.
- The top N and bottom N players per group are promoted/demoted (N configurable in the sidebar, default 1).
- Players with incomplete rows in the scores matrix are flagged as **DNF** and sit out the next rotation.
- Tie-breaking in win%: alphabetical by name (deterministic, TBD for operator override).
- Preview mode shows the movements without writing anything; **Commit** applies them to Participants.

---

## League Rules Summary

- Tiers: S → A → B → C → D (configurable)
- Each tier is split into groups per rotation (round-robin within group)
- New (QUEUED) players are activated via Phase 2B and sorted into groups on the next Phase 1 run
- DNF players sit out one rotation and return as ACTIVE the following cycle
- INACTIVE players are excluded from all calculations
