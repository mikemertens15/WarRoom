import snapshot from "../../data/players-2026.json";
import { defaultLeague } from "./config";
import { newDraft } from "./draft";
import { normalizePlayers } from "./ingest";
import type { DraftState } from "./types";

export const CURRENT_DATA = snapshot.metadata;
export function currentPlayers() {
  return normalizePlayers(snapshot.players);
}
export function newCurrentDraft() {
  return newDraft(
    { ...defaultLeague(), datasetLabel: CURRENT_DATA.label },
    currentPlayers(),
  );
}
const key = (name: string, position: string) =>
  `${position}:${name
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\.?$/g, "")
    .replace(/[^a-z0-9]/g, "")}`;

/** User-requested snapshot update. Preserve all picks, settings, cursor and undo.
 * Refuse ambiguous/missing historical identities instead of guessing or deleting.
 */
export function applyCurrentData(state: DraftState): DraftState {
  const players = currentPlayers();
  const incomingIds = new Set(players.map((p) => p.id));
  const old = new Map(state.players.map((p) => [p.id, p]));
  const mapping = new Map<string, string>();
  const referenced = new Set(
    [...state.picks, ...state.history.flatMap((h) => h.picks)].filter(
      (id): id is string => id !== null,
    ),
  );
  for (const id of referenced) {
    if (incomingIds.has(id)) {
      mapping.set(id, id);
      continue;
    }
    const previous = old.get(id);
    const matches = previous
      ? players.filter(
          (p) =>
            key(p.name, p.position) === key(previous.name, previous.position),
        )
      : [];
    if (matches.length !== 1)
      throw new Error(
        `Cannot safely match ${previous?.name ?? id} from the saved draft/history. Export this draft before starting a new one with current data.`,
      );
    mapping.set(id, matches[0].id);
  }
  const remap = (picks: (string | null)[]) => {
    const result = picks.map((id) => (id === null ? null : mapping.get(id)!));
    if (new Set(result.filter(Boolean)).size !== result.filter(Boolean).length)
      throw new Error(
        "Data update would map multiple drafted players to one identity.",
      );
    return result;
  };
  return {
    ...state,
    players,
    league: { ...state.league, datasetLabel: CURRENT_DATA.label },
    picks: remap(state.picks),
    history: state.history.map((h) => ({ ...h, picks: remap(h.picks) })),
  };
}
