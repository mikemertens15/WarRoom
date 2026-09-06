# Client components

`war-room.tsx` is the state coordinator: it loads storage after mount, persists before reporting success, handles stale-tab checks and routes callbacks to the domain library. `live` holds the latest committed state for fast event sequences; React state drives rendering. User-entered text is rendered as text, never inserted as HTML.

`setup.tsx` owns an editable settings/data preview. Ordinary submit validates and passes it to the coordinator. Current-data updates with existing picks/history use the identity-safe path. `draft-board.tsx` renders derived pick ownership; `edit-pick.tsx` proposes a correction without owning a second roster store.

`ui.tsx` contains the dialog's keyboard/focus handling, local file download helper and small presentation utilities. Keep shortcuts inactive while a dialog is open. `release-info.tsx` renders the current version chip and release ledger without reading or writing draft storage.

Layout styles are in `src/app/globals.css`. Check the room, setup, release log, export and board at desktop and 390px mobile widths after layout changes. The version chip must remain discoverable on mobile. Data transfer instructions belong near export/restore because that is where the user changes devices.

`keeper-editor.tsx` edits optional pre-draft reservations within Setup’s local preview. Save preparation persists without starting. `pick-planner.tsx` calculates read-only scenario comparisons only while expanded, and shows reconstructable opponent factors in Model lab. Keeper board cells stay readable but cannot be edited as live picks.
