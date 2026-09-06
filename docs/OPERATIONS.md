# Draft-night operations

## Choose where to run

| Mode | Load/reload requires | Where the draft is saved |
| --- | --- | --- |
| Local production, `127.0.0.1:3000` | The local server running on that computer | That browser's local storage |
| Stable Vercel production URL | Internet access to the hosted app | That device/browser's local storage |
| Vercel preview URL | Internet and any configured deployment access | A separate origin's local storage |

The app has no service worker or installable offline cache. Local production can operate without external internet. A loaded hosted page can keep calculating and recording with no provider calls, but a later load/reload may need the network. Use local production when disconnected reloads are essential.

## Before drafting

1. Open the app in the browser/profile you will actually use. Confirm the version chip and the dataset date in League setup.
2. Set six team names, your team and the live randomized order. Verify PPR and passing/field-goal scoring.
3. Enter zero, one or two keepers per team with last season’s round. **Save preparation** allows decisions before the order is known; reopen setup after the draw to move teams and verify new reserved pick numbers. **Start draft** once setup is correct. Verify that the on-clock team matches the board.
4. Export a JSON backup after setup and at useful breaks in the draft. Keep it somewhere you can reach from a replacement device.
5. Keep one recording tab active. Do not clear browser site data or switch to a private window mid-draft.

Use `/` or Ctrl/Cmd+K to focus search. Type enough of the name to distinguish matches, select with arrows, then Enter. The pick goes to the on-clock team. Recommendations describe your team even when an opponent is selecting. Use Undo for the latest correction, or click a live board slot to correct an earlier pick. Reserved keeper cells are protected; revise them in setup before live picks, or undo all live picks to unlock preparation. The confirmed reset clears live picks/history while retaining keepers.

## Move an existing draft to another device or domain

1. On the source device, choose **Export draft → JSON backup**. This includes player data, setup, keeper assignments, picks and undo history.
2. Transfer that file through your preferred file-sharing method. The app does not upload it for you.
3. On the destination, open the stable production URL, choose **Export draft → Restore a JSON backup** (also available in League setup), and select the file.
4. Read the replacement confirmation. If the destination already contains a draft you want, export it before confirming.
5. Check recorded pick count, last player, next on-clock team, your team and dataset label. Continue only on the destination device.

The local URL and hosted URL have separate saves even on the same laptop. So do Chrome/Edge, different browser profiles, private windows and deployment preview addresses. Bookmark the stable production domain. Hosting and installing a newer application do not synchronize drafts.

On your turn, open **Think two picks ahead** to compare projected two-player gains and scenario ranges. Review the main recommendation’s risk/tier notes as well; the scenario range is not a win probability.

Format-1 saves restore automatically with no keepers and retain their picks/history. New format-2 backups require app 1.2.0 or newer on the destination.

## Recovery table

| Symptom | Action |
| --- | --- |
| A pick was entered incorrectly | Undo, or click the earlier board cell and replace it. Check the clock after a manual jump. |
| Earlier picks are empty | Use the gap notice to return to the first unfilled pick. |
| “Change was not recorded” / storage failure | The visible successful state has not advanced. Export it before troubleshooting storage, and do not assume the failed pick saved. |
| “Draft changed in another tab” | Stop recording there. Export the authoritative tab if needed, then reload the stale tab. |
| Previous valid save recovered | Inspect the last pick; the recovered backup may be one change behind. Re-enter only what is missing. |
| Both saved copies damaged | Download the raw saved data from the recovery screen. Restore a known-good JSON file. Reset only if intentionally discarding the damaged save. |
| Current-data update cannot match a player | The update is rejected. Preserve the old draft; inspect the unmatched ID/name/history rather than deleting picks to force the update. |
| An empty draft appears on another device | Restore a JSON backup. It is a different browser store, not evidence the source draft was deleted. |
| The local URL will not load | Start `npm run start` from the project after a successful build. Check that another process has not occupied port 3000. |

## After the draft

Export a final JSON backup and verify 108 filled slots (keepers plus live picks). CSV, copied roster text and print/PDF are useful for manual league entry; only JSON is restorable. Keep the original final-draft backup unchanged when later adding season transactions. Weekly lineups, waivers, trades, live scores and automatic ESPN submission are not implemented in this release.
