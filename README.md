# fgc-league-sheets

Google Sheets extension app (Apps Script add-on) for managing long-term League events for the FGC. This app automates handling group distribution, score matrix generation, promotion/demotion calculations, and rollback to previous versions.

**Copy [this Template](https://docs.google.com/spreadsheets/d/1FojOkjQJD1dtr29fwH8bgabIdfxd-Yp72V0-pqbIqcc/edit?usp=sharing) to use this extension app.** Any time this app is updated, you will need to make a new copy from the template to get the latest version as Google snapshots the script when a copy is made.

___It is required to maintain the formatting of the Participants sheet and generated Score sheet.___ App functionality depends on these formats.

fgc-league-sheets also pairs with [Adomin-san Discord Bot](https://github.com/enpicie/adomi-san-bot)! Adomin also requires the formatting used with this app, and she helps participants join/deactivate from your league and report scores thru Discord.

---

## Table of Contents

1. [Quick start](#quick-start)
2. [How it works](#how-it-works)
3. [First-time setup](#first-time-setup)
4. [Setting up the Participants sheet](#setting-up-the-participants-sheet)
5. [Using the extension](#using-the-extension)
6. [Sheet contract](#sheet-contract)
7. [Group distribution algorithm](#group-distribution-algorithm)
8. [CI/CD](#cicd)
9. [Local development](#local-development)
10. [Troubleshooting](#troubleshooting)

---

## Quick start

This is the end-to-end flow for running a rotation once the extension is deployed.

### Before the first rotation

Copy the Template File (linked at the top of this doc) to start with the core Participants sheet and have the latest version of this extension.

### Each rotation

```
1. (Optional) Add new players with Status = QUEUED
2. Phase 2B — Activate Queued Players   ← promotes QUEUED → ACTIVE
3. Phase 1  — Start Cycle               ← assigns groups, creates Scores sheet
4. Players enter match results in the Scores sheet
5. Phase 2A — Preview                   ← review promotions, demotions, DNFs
6. Phase 2A — Commit                    ← writes results back to Participants
   └─ Rollback available immediately after commit if something looks wrong
```

**Open the sidebar:** League Manager → Open Sidebar (appears in the sheet menu bar after first push).

**Phase 1 recommended settings:** Group size 5 min / 7 max · S tier = 1 group · A tier = 2 groups · remaining tiers auto.

**After each rotation:** update the `Group Rank` column in Participants with each player's finishing rank within their group (1 = top). This seeds the groups for the next rotation.

---

## How it works

The extension is a [bound Google Apps Script](https://developers.google.com/apps-script/guides/bound) attached to a specific Google Sheet. It adds a **League Manager** menu to the sheet's menu bar. From there, operators open a sidebar that drives the two-phase rotation lifecycle:

```
Phase 1 (Start Cycle)          Phase 2 (End Cycle)
─────────────────────          ───────────────────
Archive old Scores sheet   →   Read win% from Scores sheet
Run group distribution     →   Flag DNF players
Generate new Scores sheet  →   Calculate promotions/demotions
Write assignments back     →   Commit or rollback changes
```

The extension is **stateless** — every operation reads the current state of the Participants sheet and derives everything from it. There is no memory of previous rotations beyond what the sheet itself records.

---

## First-time setup

### Prerequisites

- Node.js 20+
- A Google account
- Google Apps Script API enabled on your account:
  1. Go to `script.google.com/home/usersettings`
  2. Toggle **Google Apps Script API** to **On**
  - This is a one-time per-account setting. Without it, `clasp push` will fail with a cryptic token error.

### 1. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Name it whatever you like (e.g. "FGC League")
3. Open **Extensions → Apps Script** from the sheet's menu bar
4. This creates a bound script project. Copy the script ID from the URL:
   ```
   https://script.google.com/home/projects/{SCRIPT_ID}/edit
   ```
5. Rename the Apps Script project if desired (click the project name at the top of the editor)

### 2. Clone and install

```bash
git clone <this repo>
cd fgc-league-sheets
npm install
```

### 3. Log in to clasp

```bash
npx clasp login
```

This opens a browser. Sign in with the same Google account that owns the sheet. After authorizing, clasp writes credentials to `~/.clasprc.json`.

> **Important:** The clasp version in `package.json` must match the version you logged in with. Check with `clasp --version` on the machine you used to log in. If they differ, update `package.json` to match.

### 4. Set the script ID

Edit `.clasp.json` and replace the placeholder with your script ID:

```json
{
  "scriptId": "YOUR_SCRIPT_ID_HERE",
  "rootDir": "./dist"
}
```

### 5. Push and authorize

```bash
npm run push
```

Then:
1. Open the Google Sheet
2. A **League Manager** menu should appear in the menu bar
3. Click **League Manager → Open Sidebar**
4. On the first run, Google will show an authorization dialog — click through it
5. The sidebar will open

If the menu doesn't appear, close and reopen the sheet tab. If it still doesn't appear, go to **Extensions → Apps Script**, select `onOpen` from the function dropdown, and click **Run** to trigger the authorization flow manually.

---

## Setting up the Participants sheet

The extension reads from and writes to a sheet named exactly **`Participants`** (case-sensitive). Create this sheet in your workbook and set up the following column headers in **row 1**:

| Col | Header | Notes |
|-----|--------|-------|
| A | `Status` | Set a dropdown: `ACTIVE`, `QUEUED`, `DNF`, `INACTIVE` |
| B | `Discord ID (@)` | Discord handle — used by the bot for score lookups |
| C | `Participant Name` | Display name shown in the score matrix |
| D | `Tier` | Current tier (e.g. `S`, `A`, `B`, `C`, `D`) |
| E | `Group #` | Written by the extension on Phase 1 |
| F | `Group Rank` | Rank within group — used to seed groups next rotation |
| G | `Notes` | Freeform operator notes |
| H | `Wins Row` | Written by the extension — sheet row in current Scores matrix |
| I | `Losses Col` | Written by the extension — sheet column in current Scores matrix |
| J | `Current Rotation:` | Label cell — do not change |
| K | *(scores sheet name)* | Written by the extension on Phase 1 — the name of the active Scores sheet |

**Player statuses:**

| Status | Meaning |
|--------|---------|
| `ACTIVE` | In the current rotation — included in Phase 1 group distribution |
| `QUEUED` | Waiting to be activated — run Phase 2B to promote to ACTIVE |
| `DNF` | Did not finish last rotation — sits out one cycle, then returns as ACTIVE |
| `INACTIVE` | Excluded from all calculations |

**To add a new player:** add a row with Status = `QUEUED`, fill in their name and tier, leave all other columns blank. Run Phase 2B when ready to activate them.

**Group Rank:** after each rotation, update this column with each player's final rank within their group (1 = top). The extension uses this to seed groups in the next Phase 1 run, interleaving players across groups so each group gets a mix of skill levels. Leave at 0 for new players.

---

## Using the extension

Open the sidebar via **League Manager → Open Sidebar**. The top of the sidebar always shows the current rotation state (rotation number, active Scores sheet name, player counts by status).

### Phase 1 — Start Cycle

Generates groups and creates a new score matrix sheet.

**Configuration:**

- **Cycle label** *(optional)* — a human-readable label like `Week`. Combined with rotation number to name the sheet.
- **Rotation #** *(optional)* — integer rotation number. Combined with cycle label.
- **Group size** — min and max players per group. **Recommended: 5 min / 7 max.**
- **Tier configuration** — list of tiers top to bottom. For each tier, optionally set a desired group count. **Recommended: S = 1 group, A = 2 groups, B/C/D = auto.**

**Sheet naming:**

| Inputs | Sheet name |
|--------|------------|
| No label, no number | `Scores` |
| Label = `Week` | `Scores Week` |
| Number = `3` | `Scores 3` |
| Label = `Week`, Number = `3` | `Scores Week-3` |

On the next Phase 1 run, the current Scores sheet is renamed to `Prev Scores ...` before a new one is generated. There is always exactly one active `Scores` sheet and one `Prev Scores` sheet.

**What Phase 1 writes to Participants:**
- `Tier` — updated for fill-promoted players
- `Group #` — group number within tier
- `Wins Row` — the sheet row in the Scores matrix for this player's wins
- `Losses Col` — the sheet column in the Scores matrix for this player's losses
- `Current Rotation:` (K1) — the name of the newly created Scores sheet

**Warnings:** Phase 1 warns (but does not block) if there are queued players who haven't been activated yet.

---

### Entering scores

Scores are entered directly into the Scores sheet. Each group block has this layout:

```
Row 1 │ Tier │ In Progress │ Wins -> │ … │ Wins │ Played │ Win%  │ Rank │
Row 2 │ Group N │ Player A │ Player B │ … │ Wins │ Played │ Win%  │ Rank │  ← pink
Row 3 │ Player A │   │ ■  │ …  │ =formula │ =formula │ =formula │ =formula │
Row 4 │ Player B │   │    │ …  │
…
Row N+3 │ Losses │ =col sum │ … │ Total │ Completion │ =% │
Row N+4 │ (blank separator)
```

- **Rows = wins.** Cell `[Player A's row, Player B's column]` = wins that Player A has over Player B.
- **Columns = losses.** A player's losses column is filled in by their opponents' rows.
- **Black diagonal cells** = self-play (no value, never edited).
- **Win%, Rank, and Completion** update automatically via formulas as scores are entered.
- **"In Progress" / "Completed"** — the status cell in each tier header updates automatically when Completion reaches 100%.

The Discord bot writes scores using the `Wins Row` and `Losses Col` values from Participants. Manual entry works the same way.

**Colour guide:**

| Colour | Element |
|--------|---------|
| Pink | Group column headers and Losses footer rows |
| Blue | Player name column |
| Black | Diagonal (self-play) cells |
| Green | Win% column |
| Gold | Rank column |
| Yellow | "In Progress" status |
| Light gray | Tier header row |

---

### Phase 2 — End Cycle

#### Step A — Calculate Promotions & Demotions

1. Click **Preview** to see which players promote, demote, or are flagged DNF — no changes are written.
2. Review the list.
3. Click **Commit** to apply the changes to Participants.

**Before committing**, the extension automatically saves a full copy of Participants to a hidden `_ParticipantsBackup` sheet.

**DNF logic:** a player is marked DNF if they have played fewer matches than `N-1` (where N is their group size). They sit out the next rotation and automatically return to ACTIVE the rotation after.

**Promotion/demotion:** the top N and bottom N players per group (by win%) move up or down one tier. N is configurable in the sidebar (default 1). Ties in win% are broken by head-to-head record (whoever won more games directly against the tied opponent ranks higher). If head-to-head is also equal, the tiebreak falls back to alphabetical order by name. Note: the Rank column displayed in the Scores sheet uses Win% only — head-to-head tiebreaking is applied server-side when Phase 2A runs.

**Rollback:** if a backup exists from the last commit, a **Rollback** button appears in the sidebar. Clicking it restores Participants to exactly the state it was in before the last commit. The backup is overwritten on every new commit, so rollback only covers the most recent one.

#### Step B — Activate Queued Players

Moves all `QUEUED` players to `ACTIVE`. They will be sorted into groups on the next Phase 1 run. Run this before Phase 1 if new players should be included in the upcoming rotation.

---

## Sheet contract

This contract is shared with `adomi-san-bot`. Both projects must honour it.

**Sheet names:**

| Sheet | Purpose |
|-------|---------|
| `Participants` | Persistent player roster — the source of truth |
| `Scores ...` | Current rotation score matrix |
| `Prev Scores ...` | Previous rotation matrix (archived by Phase 1) |
| `ReportLog` | Bot-owned append-only score log — the extension never touches it |
| `_ParticipantsBackup` | Hidden — created by Phase 2A commit for rollback |

**Bot score reporting flow:**
1. Bot receives a score report from Discord
2. Reads Participants to find winner and loser by `Discord ID (@)`
3. Reads K1 to get the current Scores sheet name directly
4. Uses `Wins Row` for the winner and `Losses Col` for the loser
5. Writes the win count to `sheet[winsRow, lossesCol]`
6. Appends to `ReportLog`: `LeagueID | Tier | Group | Winner | Loser | WinnerScore | LoserScore | Timestamp`

---

## Group distribution algorithm

The algorithm is top-down and monotonicity-constrained.

**Phase 1 — Resolve group counts:**

For each tier in order (top to bottom):
- If `desired_groups` is set and `desired_groups × min ≤ players ≤ desired_groups × max` → use it
- Otherwise derive: `min_groups = ceil(players / max_size)`, pick the fewest groups (largest groups = most competitive)
- **Monotonicity:** each tier's group count must be ≥ the tier above it. If the derived count would violate this, it is raised with a warning.

**Fill promotion:** if a tier with `desired_groups` set doesn't have enough players to reach `desired_groups × min_size`, the top-ranked players from the tier below are temporarily promoted to fill it. These players may revert next rotation.

**Phase 2 — Within-tier balancing:**

Players are sorted by `Group Rank` ascending (rank 1 = highest), then distributed round-robin across groups. This interleaves skill levels so each group gets a mix rather than chunking the best players together.

**Example with 15 players, 2 groups, size 5–7:**
```
Sorted rank: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
Group 1:     1, 3, 5, 7, 9, 11, 13, 15
Group 2:     2, 4, 6, 8, 10, 12, 14
```
Both groups get a spread of high and low ranked players.

---

## CI/CD

The GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and pushes to Apps Script on every push to `main`. It can also be triggered manually from **GitHub → Actions → Deploy → Run workflow**.

**Required GitHub secret:**

| Secret | Value |
|--------|-------|
| `CLASPRC_JSON` | Full contents of `~/.clasprc.json` after running `clasp login` |

**To get the token:**
```bash
npx clasp login
# Then read the file:
cat ~/.clasprc.json   # macOS/Linux
type %USERPROFILE%\.clasprc.json   # Windows
```

Copy the entire JSON output and add it as `CLASPRC_JSON` in **GitHub → Settings → Secrets and variables → Actions**.

**The script ID** is committed in `.clasp.json` directly, so no additional secret is needed for it.

**Pipeline steps:**
1. Checkout the repo
2. Set up Node 20 with npm cache
3. `npm ci` — install exact versions from lockfile
4. Write clasp credentials — `printf '%s' "$CLASPRC_JSON" > ~/.clasprc.json`. `printf` is used instead of `echo` to avoid appending a trailing newline, which would corrupt the JSON and cause an auth failure.
5. `npm run push` — webpack build + copy `appsscript.json` to `dist/` + `clasp push --force`

> `clasp push` is destructive — it replaces all remote files. The repo is always the source of truth. Never edit code in the browser Apps Script editor.

---

## Local development

```bash
# Install dependencies
npm install

# Log in to clasp (one-time per machine)
npx clasp login

# Build and push to Apps Script
npm run push

# Open the Apps Script project in the browser
npm run open
```

**Stack:** webpack 5, TypeScript, React 18, `gas-webpack-plugin`, `html-webpack-plugin`

The build produces two output files in `dist/`:
- `Code.js` — the server-side GAS bundle (all server TypeScript compiled and wrapped)
- `sidebar.html` — the React sidebar inlined into a single HTML file (no external script references)
- `appsscript.json` — copied from the repo root by the push script

`sidebar-bundle.js` is excluded from the push via `.claspignore` — it is inlined into `sidebar.html` and must not be pushed separately, as GAS would execute it server-side where `document` is undefined.

**Project structure:**
```
src/
  server/
    index.ts          — onOpen menu, global function declarations for google.script.run
    types.ts          — shared TypeScript interfaces and column constants
    sheet-helpers.ts  — Participants read/write, backup/restore, sheet naming
    scores-sheet.ts   — score matrix builder and reader
    algorithm.ts      — group distribution algorithm
    phase1.ts         — Start Cycle orchestration
    phase2.ts         — End Cycle: promotions, DNF, activate queued, backup
  client/
    sidebar/
      App.tsx                     — tab navigation, status refresh
      components/
        StatusPanel.tsx           — rotation state display
        Phase1Panel.tsx           — cycle config form and start button
        Phase2Panel.tsx           — promotions preview/commit, rollback, activate queued
        WarningList.tsx           — warning display
      styles.css                  — Google-style sidebar theme
      types.ts                    — client-side type mirrors
      gas.d.ts                    — google.script.run TypeScript declarations
      index.html / index.tsx      — React entry point
```

---

## Troubleshooting

**"League Manager" menu doesn't appear**
- Close and reopen the sheet tab — `onOpen` only fires on sheet load
- Go to **Extensions → Apps Script → Run → onOpen** to trigger authorization manually

**`ReferenceError: document is not defined`**
- `sidebar-bundle.js` was pushed to Apps Script and GAS tried to execute it server-side
- Ensure `.claspignore` contains `sidebar-bundle.js`
- Re-push

**`Error retrieving access token`**
- The Google Apps Script API is not enabled — go to `script.google.com/home/usersettings` and toggle it on
- Or the clasp version used to log in doesn't match the one in `package.json` — check both with `clasp --version` and align them

**Phase 1 produces no groups / warnings about unrecognized tiers**
- Players in Participants have a `Tier` value that doesn't match any tier in the Phase 1 config
- Tier names are case-sensitive — `S` ≠ `s`

**Phase 2 shows no movements**
- No active Scores sheet found, or scores haven't been entered yet
- `Played` column shows 0 for all players — no scores have been recorded

**Rollback button doesn't appear**
- No backup exists — Phase 2A has not been committed in this session
- The backup is created at commit time, not at preview time
