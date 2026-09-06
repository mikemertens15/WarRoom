import { ROUNDS, TEAM_COUNT } from "./config";
import { keeperAssignments, validateLeague } from "./draft";
import { normalizePlayers } from "./ingest";
import type { DraftState, Snapshot } from "./types";
/** Keep these keys stable across app releases. Website origin and browser profile
 * partition storage; Vercel hosting supplies no automatic cross-device replication.
 */
export const STORAGE_KEY = "draft-war-room:v1";
export const BACKUP_KEY = `${STORAGE_KEY}:backup`;
/** Untrusted JSON boundary for reload/restore. Validate all historical references,
 * not just current picks, so a successful restore cannot break on the next undo.
 * Throws without writing anything; the caller decides recovery/confirmation.
 */
export function decodeState(raw: string): DraftState {
  const parsed = JSON.parse(raw);
  // Schema 1 had no keeper semantics. Migrate in memory; the next successful
  // write saves schema 2 while retaining the prior raw file as recovery.
  if (parsed?.version === 1 && parsed.keepers !== undefined)
    throw new Error("Version-1 backups cannot contain keeper assignments.");
  const s = (
    parsed?.version === 1 ? { ...parsed, version: 2, keepers: [] } : parsed
  ) as DraftState;
  if (
    !s ||
    s.version !== 2 ||
    typeof s.started !== "boolean" ||
    typeof s.updatedAt !== "string" ||
    typeof s.revision !== "string"
  )
    throw new Error("This is not a supported draft backup.");
  validateLeague(s.league);
  const players = normalizePlayers(s.players);
  const ids = new Set(players.map((p) => p.id));
  const reserved = keeperAssignments(s.league, players, s.keepers);
  const validSnapshot = (snap: Snapshot) => {
    if (
      !snap ||
      !Array.isArray(snap.picks) ||
      snap.picks.length !== TEAM_COUNT * ROUNDS ||
      snap.picks.some(
        (p) => p !== null && (typeof p !== "string" || !ids.has(p)),
      ) ||
      new Set(snap.picks.filter(Boolean)).size !==
        snap.picks.filter(Boolean).length ||
      !Number.isInteger(snap.cursor) ||
      snap.cursor < 0 ||
      snap.cursor > snap.picks.length ||
      (snap.cursor === snap.picks.length && snap.picks.includes(null))
    )
      throw new Error("Draft backup contains invalid picks or a bad cursor.");
    for (const [index, keeper] of reserved)
      if (snap.picks[index] !== keeper.playerId)
        throw new Error("Draft backup changed a reserved keeper pick.");
    if (reserved.has(snap.cursor))
      throw new Error("Draft cursor cannot point to a keeper reservation.");
  };
  validSnapshot(s);
  if (!Array.isArray(s.history) || s.history.length > 250)
    throw new Error("Draft history is invalid.");
  s.history.forEach(validSnapshot);
  if (!s.started && s.picks.some((id, i) => id !== null && !reserved.has(i)))
    throw new Error("Unstarted draft contains picks.");
  return { ...s, players };
}
/** Persist a caller-validated candidate before the UI announces success.
 * Backup and primary writes are separate, not transactional. Storage errors must
 * propagate; keep the last successful in-memory state when this function throws.
 */
export function saveState(
  storage: Pick<Storage, "getItem" | "setItem">,
  state: DraftState,
): void {
  decodeState(JSON.stringify(state)); // Reject inconsistent candidates before either storage write.
  // Keep the last valid save as recovery. If quota is exhausted, fail visibly.
  const old = storage.getItem(STORAGE_KEY);
  if (old) {
    try {
      decodeState(old);
      storage.setItem(BACKUP_KEY, old);
    } catch (e) {
      if (e instanceof DOMException) throw e;
    }
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}
/** Read-only recovery: prefer a valid primary, then the previous save. Return null
 * only when both keys are absent; damaged data must never imply an automatic reset.
 */
export function loadState(storage: Pick<Storage, "getItem">): {
  state: DraftState | null;
  recovered: boolean;
} {
  const raw = storage.getItem(STORAGE_KEY);
  const backup = storage.getItem(BACKUP_KEY);
  if (!raw && !backup) return { state: null, recovered: false };
  try {
    if (raw) return { state: decodeState(raw), recovered: false };
  } catch {
    /* Try the independent last valid save. */
  }
  if (backup) return { state: decodeState(backup), recovered: true };
  throw new Error(
    "Saved draft is damaged. Import a JSON backup or explicitly reset; your stored data has not been overwritten.",
  );
}
