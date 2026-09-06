# Draft War Room

A local-first command center for a six-team offline fantasy football snake draft. Record physical-board picks with the keyboard, see every roster, and compare the value of taking a player now with the alternatives likely to survive your next turn.

**Release 1.1.0.** Click the version chip beside the app name to see the release log. [Release history](CHANGELOG.md) · [Documentation index](docs/README.md) · [Contributor guide](CONTRIBUTING.md).

**[Open the production War Room](https://war-room-seven-eosin.vercel.app)** · [Deployment record](docs/DEPLOYMENTS.md). Bookmark this stable address for use on other devices.

The app can run on your laptop or Vercel. **Drafts save in each browser, with no automatic device sync.** Vercel makes the interface accessible on other devices; use a JSON backup to carry your draft there. See [device transfer and recovery](docs/OPERATIONS.md) and [hosting and releases](docs/DEPLOYMENT.md). Season-management work is outlined in the [roadmap](docs/ROADMAP.md).

**The default pool contains 534 real 2026 players and defenses**, retrieved September 6, 2026 at 8:01 a.m. America/Chicago. ESPN supplies season projections, usable ADP, teams, bye weeks and injury/status designations. FantasyPros supplies PPR consensus ranks. The separate downloadable 198-player sample remains synthetic practice data.

## Run locally

Requires Node.js 20.9+ and npm. Node 24 was used for verification.

```powershell
cd C:\Users\drumm\OneDrive\Desktop\dev\WarRoom
npm ci
npm run dev
```

Open **http://127.0.0.1:3000**. Keep that terminal running. No credentials, database, API keys, cloud account or deployment are required. Internet access is needed to install dependencies, but the running app does not need external services, fonts, images or player APIs.

For draft night, build beforehand and run the production server:

```powershell
npm run build
npm run start
```

Stop the development server with Ctrl+C before starting the production server on the same port. The scripts deliberately use the same host and explicit port. **Use the same browser profile and exact URL every time**: `localhost`, `127.0.0.1`, different ports, and private windows have different browser storage. If port 3000 is occupied, stop the other server rather than switching origins mid-draft. Refresh requires the local server to be running; this is not a service-worker/PWA installation.

## Draft-night workflow

1. Choose **Set up draft**. Enter the six team names and select **Mine** beside your team.
2. Use the order arrows to match the physical random draw. The app reverses the six-team order every other round automatically.
3. Use the bundled 2026 snapshot or import your own CSV/JSON player pool. Inspect warnings and check scoring. **Start draft** saves the setup.
4. Press **/** or **Ctrl/Cmd+K**, type part of a name, then **Enter**. Arrow keys select another match; Escape closes search. `chase` finds Ja'Marr Chase in the sample. Selection assigns that player to the team **on the clock**, even when it is an opponent's pick.
5. Use **Why this pick?**, any player name, or a forecast row to inspect the score. The highlighted recommendation always targets **your** roster; the recording button explicitly names the current opponent when it is not your turn.
6. **Undo** reverses the latest pick action, including an earlier-pick correction. **Ctrl/Cmd+Z** also works outside text inputs. Native text undo is preserved while typing.
7. Click any draft-board cell to add/correct that pick without moving the current clock. The replaced player returns to availability. Use **Go to pick** to explicitly move the clock; empty earlier picks produce a warning and a return-to-first-empty button.
8. Export a **JSON backup** periodically. At the end, export CSV, copy your roster, or print all rosters for manual entry into ESPN. The app does not submit anything to ESPN.
9. To switch devices, transfer the JSON backup file, open the stable production website on the destination device, and choose **Export draft → Restore a JSON backup**. Review and confirm replacement there. Compare the last pick and team before continuing. CSV and roster text cannot restore a draft.

There are **18 rounds / 108 picks**: 10 starters and 8 bench spots per team. The IR spot is reserved and not drafted. FLEX is **RB/WR only**, following the requested 36 league-wide RB/WR starting slots. Starting roster display is provisional: the highest projected players fill the base positions, then remaining RB/WR fill FLEX. FLEX/bench assignments rebalance after every pick and scoring change. There are no enforced ESPN positional maximums. The input accepts actual physical-board picks, even if a team makes an unusual roster decision; the needs display flags missing starters.

Order and arbitrary player-pool replacement lock after the first recorded pick to prevent silently reassigning the board or losing drafted IDs. Team names, which team is yours, and scoring remain editable. **Load latest 2026 data** is a controlled exception: it preserves picks and undo history by stable ID or unambiguous exact normalized name plus position, and rejects missing or ambiguous identities. An untouched saved demo setup upgrades automatically while preserving league settings; active drafts and custom imports require the explicit update button.

## Refreshing the bundled snapshot

Before draft night, while online:

```powershell
npm run refresh:data
npm test
npm run build
npm run start
```

Stop any running server before building/starting. Reload the same browser at **http://127.0.0.1:3000**. A saved draft retains its embedded dataset until you open league setup and choose **Load latest 2026 data**. With no picks, review the preview and press **Start draft / Save settings** to persist it. With picks, the button saves the matched update directly. Export a JSON backup before a draft-night update so you also have a portable copy.

The refresh script makes explicit online requests to ESPN's public fantasy data endpoint and the [FantasyPros PPR draft rankings page](https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php). It validates season, scoring, position coverage and the entire consensus top 250 before replacing the snapshot. It never fetches during live app use. If a provider changes format or validation fails, the prior player snapshot stays available.

`data/players-2026.json` contains players and source metadata; `data/players-2026-audit.json` records provider IDs, original ESPN totals, scoring adjustments, omitted players and source hashes. The September 6 snapshot has 66 QB, 119 RB, 180 WR, 100 TE, 32 DST and 37 K; 473 consensus ranks and 191 usable ADPs. ESPN ADP at or above 169 is censored near its undrafted ceiling and is left missing; availability then uses consensus/model rank. No synthetic risk, upside or imported tiers are added. ESPN status is a snapshot, not an independent news check.

FantasyPros supplied a September 6 consensus update timestamp. ESPN does not expose its projection publication timestamp here: the retrieval time is **not** a claim that every projection was revised that morning. All projections are full-season 2026, not Week 1. Defense totals use ESPN default scoring; kickers replace ESPN field-goal point buckets with exact projected made-field-goal yards × 0.1, retaining ESPN's other kicker adjustments.

## Importing real 2026 data

To use another provider, obtain projections and ADP from a source you trust and are entitled to use. Export/transform their columns into the normalized schema below. The live app has no provider dependency. Use one row per player, including kickers and defenses. The file picker accepts a JSON array, `{ "players": [...] }`, or a CSV with exact header names. UTF-8 BOM, CRLF, quoted commas, escaped quotes and embedded quoted newlines are supported.

Starter coverage is checked before starting: at least 108 players total, 12 RB, 12 WR, 36 RB/WR combined, and six each of QB, TE, DST and K. Import a deeper pool (normally 200–400 players) to make replacement/bench forecasts useful. Sparse positional pools generate warnings. Imports are validated before replacing the setup preview; malformed rows identify the row and field.

| Field | Required | Meaning |
|---|---|---|
| `id` | Yes | Stable unique provider-independent ID; strings/numeric IDs accepted |
| `name` | Yes | Display/search name |
| `team` | Yes | NFL abbreviation, `FA`, or a defense's team |
| `position` | Yes | `QB`, `RB`, `WR`, `TE`, `DST`, `K`; `D/ST` and `DEF` normalize to `DST` |
| `projection` | Yes | Projected **season total** fantasy points, already matching this league's scoring unless `stats` is provided |
| `adp` | No | Positive overall **pick number**, not a round or positional ADP |
| `consensusRank` | No | Positive overall rank; availability fallback if ADP is absent |
| `positionalRank` | No | Source positional rank; retained in the dataset. The displayed positional rank is recomputed from scored projections |
| `tier` | No | Positive **positional** tier, lower is better; otherwise generated from projection gaps |
| `bye` | No | Integer 1–18 |
| `status` | No | Injury/status text shown in the table and inspector; not automatically translated into a risk penalty |
| `upside`, `risk` | No | Normalized 0–1 metrics; omitted means 0 bonus/penalty, not a claim of safety |
| `source` | No | Provider/date/method text, preferably including the scoring format |
| `season` | No | Four-digit year; set 2026 for verified 2026 data |
| `sample` | No | Boolean; true displays the mock-data banner |
| `stats` | No | Projected season statistics as a JSON object; JSON-encoded object in a quoted CSV field also works |

Use the downloadable CSV template and full sample JSON in **League setup** for the exact shape. The one-row CSV template is an illustration, not a draft-ready pool. `data/players-template.csv` and `data/scoring-example.json` are included in the repository. Blank optional CSV cells mean missing, not zero. Do not put `N/A`, percentages, currency symbols or thousands separators into numeric fields. Import limits are 10 MB / 5,000 players; backups allow 15 MB. IDs must be unique. Projection values must be finite (-100–2,000), ADP positive, and tiers/ranks integral.

### Scoring contract

Default scoring: 1 point/reception; 4/pass TD; 6/rush TD and receiving TD; 0.04/pass yard; 0.1/rush or receiving yard; -2/interception and fumble lost; 0.1/yard of **made** field goals; 1/made extra point. Thus a 38-yard field goal contributes approximately 3.8 points. Additional kicker miss/long-distance bonuses are not inferred.

**Aggregate projections cannot be correctly converted to another scoring system without underlying stats.** Editing scoring changes only players with a `stats` object. Other players keep their imported total, with a visible warning. Avoid mixing differently scored sources.

Supported `stats` keys: `passYards`, `passTD`, `interceptions`, `rushYards`, `rushTD`, `receptions`, `recYards`, `recTD`, `fumblesLost`, `fgYards`, `extraPoints`, `dstPoints`, `otherPoints`. When stats exist, the total is recomputed entirely from those stats; omitted keys mean zero. Supply a complete relevant stat line. `fgYards` is the sum of distances of made field goals. `dstPoints` is a provider-calculated season DST total under your defense scoring; this MVP does not invent a detailed DST points-allowed model. `otherPoints` is a fixed points adjustment for source rules outside the configurable core stats, such as two-point conversions, return scores or kicker miss penalties. Both points fields retain multiplier 1 when scoring settings change. The bundled ESPN stat lines retain those residual source points; they are not inferred player bonuses. Supply aggregate league-scored projections for any other rules without a usable stat breakdown.

## How the recommendation works

All assumptions and weights live in **`src/lib/config.ts`**, and the pure engine is **`src/lib/engine.ts`**. The interface exposes the important numbers in **Why?** and **Model lab**.

### Replacement and FLEX

1. Score the full imported pool and sort within positions.
2. Reserve the first 12 RBs and first 12 WRs for base starters.
3. Combine the remaining RB/WR; allocate the best 12 to FLEX. Each position's replacement rank is one past its total allocated starters. The combined FLEX baseline is the next unallocated skill player.
4. For RB/WR use the lower of the positional and FLEX baseline, recognizing both ways to enter a lineup. For QB/TE/DST/K, use the seventh player, reflecting six teams.
5. Starting VOR is scored projection minus that baseline. Keep this signed value visible. Positive starter VOR contributes to value; negative starter VOR contributes zero rather than making surplus-roster multipliers perversely attractive.
6. Add discounted depth value: `0.20 × max(0, projection − bench baseline)`. Bench baseline assumes one QB, three RB, three WR and one TE reserve per team, beyond allocated starters. This is a tunable valuation assumption totaling eight bench spots, **not a roster constraint**. It distinguishes useful backups below starting replacement from fringe players.

Baselines are calculated from the **entire** original pool and stay stable through the draft; scarcity comes from the remaining pool. When a pool is too thin, use its last known player's projection as a conservative baseline and show a data warning.

### Availability and opportunity cost

- On your turn, forecast the next one **after** your current pick. Otherwise forecast your upcoming pick, including the current opponent in the intervening selections. Consecutive picks have zero intervening selections and 100% survival. A final turn has no waiting urgency. Already filled future picks are skipped after manual jumps; missing earlier picks are explicitly flagged.
- For each intervening team, assign available players selection weights proportional to `exp(−(market rank − earliest market rank) / 13)`. Market rank blends 75% ADP with 25% league rank. Without ADP, use consensus rank or league rank. ADP from a 12-team league still has market bias; import league-relevant ADP when available.
- Multiply by positional demand: 1.65 for an unfilled starter/FLEX need, 0.55 for a filled position, 0.22 once a backup exists. Multiply by remaining availability. Remove each player's expected share of that pick and update expected opponent positional counts before the next pick.
- For each candidate, sort same-position alternatives by league value. Approximate the expected best survivor using independent survival probabilities. A named “likely alternative” is the highest valued one with at least a 45% estimated survival chance; the expected value and the named alternative are distinct quantities.
- Waiting urgency is `0.85 × max(0, candidate value − expected best alternative value) × probability gone × roster fit`. A scarce RB can therefore outrank a slightly more valuable WR with plentiful surviving peers. An automated test covers that exact situation.
- A last-in-tier candidate gets up to 7 additional points, scaled by probability gone and fit, only when the likely same-position alternative has a worse tier. Imported tiers are used as supplied; inferred tiers start a new tier once projection falls more than 22 points below the tier leader.

### Roster fit and score

`score = league value × fit + waiting urgency + tier cliff + roster need + upside − risk`

- Fit: 1.0 for an open starter/FLEX slot, 0.42 for RB/WR depth, 0.14 for a singleton-position backup, 0.04 for further singleton surplus.
- An open starter/FLEX need adds 12. When remaining draft slots are no greater than open starter slots, another 200 is added and recommendations only consider positions that can fill those needs. Recording physical-board picks remains unrestricted.
- Upside contributes `8 × upside × fit`; risk subtracts `16 × risk`. Status labels do not change these numbers implicitly.
- **TAKE** is the top eligible recommendation. **TIER CLIFF** requires the tier adjustment. **LIKELY GONE** means survival below 35%; **STRONG VALUE** means league value above 65; **WAIT** means survival at least 70%. Labels have that priority order and are shortcuts to the quantitative inspector.

These estimates are transparent directional heuristics, **not calibrated real-world probabilities**. The model does not predict injuries, coach decisions, sleepers without numeric inputs, keeper costs, or actual opponent strategies. FLEX value is included in the baseline, not added twice. Forecast alternatives currently compare within the same position; cross-position decisions occur by comparing the resulting candidate scores.

## Autosave and recovery

The browser stores versioned JSON under `draft-war-room:v1`, including imported players, setup, all 108 pick slots, cursor and up to 250 undo snapshots. A previous valid save is retained under `draft-war-room:v1:backup`.

Every draft mutation writes synchronously **before** updating the interface. On quota/storage failure, the change is rejected and the interface says it was not recorded. Export your last successful state before troubleshooting. On reload, validate the primary save; if damaged, try the previous valid save and show a recovery notice. If both fail, show a recovery screen rather than silently starting over; raw saved text can be downloaded before explicit reset.

JSON export is a portable full-state backup; CSV is for viewing/ESPN entry and is not a restore format. Restore validates before replacement and requires confirmation. Reset also requires confirmation. Changing the cursor is saved but does not add an undo action; undo reverses pick/correction actions, not settings edits.

Use one active recording tab. A storage-change event warns other tabs, and stale-tab writes are rejected rather than overwriting a newer save. This is not a multi-user synchronized database. Browser storage is tied to the device/profile/origin and can be removed by clearing site data. Export backups are the simplest portable protection.

## Verification

```powershell
npm run typecheck
npm run release:check
npm test
npm run simulate
npm run simulate -- 123
npx playwright install chromium
npm run test:e2e
npm run build
```

The deterministic suite covers snake sequencing, all six seats and next picks, gaps, undo/corrections, availability, roster/FLEX state, scoring, replacement values, opportunity cost, opponent demand, CSV/JSON validation, persistence/recovery and exports. Six seeded complete drafts check 108 unique picks and six complete rosters. The simulation's predicted/observed survival summary is a sanity check against synthetic opponents, **not a calibration claim**.

Browser tests cover keyboard entry, reload/undo, board edits, cursor jumps, imports, backups/reset, stale tabs, mobile layout/navigation and all six seat configurations. Tests use isolated browser contexts; your actual browser draft is unaffected. The development and production builds were run and the UI inspected at desktop and 390px mobile widths.

## Architecture

- `src/lib/types.ts`: provider-neutral player, scoring, draft and recommendation contracts.
- `src/lib/config.ts`: league shape, scoring and documented model coefficients.
- `src/lib/draft.ts`: immutable snake/pick/undo operations and derived rosters.
- `src/lib/engine.ts`: scoring, baseline valuation, opponent-aware survival, recommendations and explanations.
- `src/lib/ingest.ts`: validated CSV/JSON normalization and coverage warnings.
- `src/lib/persistence.ts`: versioned save validation and previous-save recovery.
- `src/lib/export.ts`: JSON-independent roster text and spreadsheet-safe CSV.
- `src/lib/simulation.ts`: deterministic-seed draft harness.
- `src/lib/current-data.ts`: bundled snapshot and identity-safe updates of saved picks/history.
- `src/lib/releases.json`: release ledger used by the version chip and generated changelog.
- `src/components/`: dashboard, setup, board, pick editor and shared dialog primitives.
- `src/app/`: Next.js shell and local CSS; no application backend routes.

A future weekly mode can reuse player/scoring contracts and roster utilities as a separate domain. It is intentionally not built now. See the [architecture guide](docs/ARCHITECTURE.md) and [season-management roadmap](docs/ROADMAP.md) before extending the draft state. Vercel currently serves the application; it stores no draft records.
