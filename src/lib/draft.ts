import {
  FLEX_SLOTS,
  MAX_KEEPERS,
  ROUNDS,
  STARTERS,
  TEAM_COUNT,
  defaultLeague,
} from "./config";
import { samplePlayers } from "./sample";
import {
  POSITIONS,
  type DraftState,
  type League,
  type Keeper,
  type PickSlot,
  type Player,
  type Position,
} from "./types";
/** Expand a permutation of stable team IDs into chronological snake slots.
 * Reverse seats, not team identity; user-facing slot numbers are one-based.
 */
export function snakeOrder(order: number[], rounds = ROUNDS): PickSlot[] {
  if (
    order.length !== TEAM_COUNT ||
    new Set(order).size !== TEAM_COUNT ||
    order.some((t) => !Number.isInteger(t) || t < 0 || t >= TEAM_COUNT)
  )
    throw new Error(
      "Draft order must contain each of the six teams exactly once.",
    );
  return Array.from({ length: rounds * TEAM_COUNT }, (_, i) => {
    const round = Math.floor(i / TEAM_COUNT);
    const seat = round % 2 ? TEAM_COUNT - 1 - (i % TEAM_COUNT) : i % TEAM_COUNT;
    return {
      overall: i + 1,
      round: round + 1,
      seat: seat + 1,
      team: order[seat],
    };
  });
}
/** Return the next unfilled array index, or null when no matching turn remains.
 * strictlyAfter skips the current pick when forecasting beyond a user's turn.
 */
export function nextPick(
  order: PickSlot[],
  from: number,
  team: number,
  strictlyAfter = false,
  picks?: (string | null)[],
): number | null {
  const i = order.findIndex(
    (p, i) =>
      i >= from + Number(strictlyAfter) &&
      p.team === team &&
      (!picks || picks[i] === null),
  );
  return i === -1 ? null : i;
}
/** Explicit sample default keeps test/practice callers independent of live data.
 * The application uses newCurrentDraft instead. No storage write occurs here.
 */
export function newDraft(
  league = defaultLeague(),
  players = samplePlayers(),
  keepers: Keeper[] = [],
): DraftState {
  const picks = Array(TEAM_COUNT * ROUNDS).fill(null);
  for (const [index, keeper] of keeperAssignments(league, players, keepers))
    picks[index] = keeper.playerId;
  return {
    version: 2,
    keepers: keepers.map((k) => ({ ...k })),
    league,
    players,
    picks,
    cursor: picks.indexOf(null) < 0 ? picks.length : picks.indexOf(null),
    started: false,
    history: [],
    updatedAt: new Date().toISOString(),
    revision: "initial",
  };
}

/** Validate assignments before deriving reserved pick IDs. Player ownership still
 * comes exclusively from the pick array and snake order, never a second roster.
 */
export function keeperAssignments(
  league: League,
  players: Player[],
  keepers: Keeper[],
): Map<number, Keeper> {
  if (!Array.isArray(keepers) || keepers.length > TEAM_COUNT * MAX_KEEPERS)
    throw new Error("Invalid keeper list.");
  const order = snakeOrder(league.order),
    ids = new Set(players.map((p) => p.id));
  const result = new Map<number, Keeper>(),
    used = new Set<string>(),
    perTeam = Array(TEAM_COUNT).fill(0);
  for (const k of keepers) {
    if (
      !k ||
      !Number.isInteger(k.team) ||
      k.team < 0 ||
      k.team >= TEAM_COUNT ||
      !Number.isInteger(k.round) ||
      k.round < 1 ||
      k.round > ROUNDS ||
      !ids.has(k.playerId)
    )
      throw new Error(
        "Each keeper needs a valid team, player and round (1–18).",
      );
    if (++perTeam[k.team] > MAX_KEEPERS)
      throw new Error("A team can keep at most two players.");
    if (used.has(k.playerId))
      throw new Error(
        "A player cannot be kept by more than one team or twice.",
      );
    const index = order.findIndex(
      (s) => s.team === k.team && s.round === k.round,
    );
    if (result.has(index))
      throw new Error("Two keepers cannot use the same team's round.");
    used.add(k.playerId);
    result.set(index, k);
  }
  return result;
}
/** Keeper reservations alone do not lock pre-draft order or count as live actions. */
export function hasLivePicks(state: DraftState): boolean {
  const reserved = keeperAssignments(
    state.league,
    state.players,
    state.keepers,
  );
  return state.picks.some((id, i) => id !== null && !reserved.has(i));
}
/** Save pre-draft choices independently of Start, including last-minute order edits.
 * Rebuild reservations only before live drafting; reject changes to frozen ownership.
 */
export function configureDraft(
  state: DraftState,
  league: League,
  players: Player[],
  keepers: Keeper[],
  start: boolean,
): DraftState {
  validateLeague(league);
  keeperAssignments(league, players, keepers);
  if (hasLivePicks(state) || state.history.length) {
    if (
      JSON.stringify(league.order) !== JSON.stringify(state.league.order) ||
      JSON.stringify(keepers) !== JSON.stringify(state.keepers)
    )
      throw new Error(
        "Order and keepers lock after live picks. Undo live picks before changing them.",
      );
    return { ...state, league, players, started: state.started || start };
  }
  return {
    ...newDraft(league, players, keepers),
    started: state.started || start,
  };
}
export function availablePlayers(state: DraftState): Player[] {
  const selected = new Set(state.picks.filter(Boolean));
  return state.players.filter((p) => !selected.has(p.id));
}
/** Derive ownership from picks and snake order; corrections need no roster sync. */
export function rosterFor(state: DraftState, team: number): Player[] {
  const order = snakeOrder(state.league.order);
  const map = new Map(state.players.map((p) => [p.id, p]));
  return state.picks.flatMap((id, i) =>
    id && order[i].team === team && map.has(id) ? [map.get(id)!] : [],
  );
}
export function counts(roster: Player[]): Record<Position, number> {
  return Object.fromEntries(
    POSITIONS.map((pos) => [
      pos,
      roster.filter((p) => p.position === pos).length,
    ]),
  ) as Record<Position, number>;
}
/** Provisional best-projection lineup: reserve base starters before RB/WR FLEX.
 * The remaining players are displayed as bench; this does not alter ownership.
 */
export function rosterSlots(
  roster: Player[],
  points: (p: Player) => number = (p) => p.projection,
): { slot: string; player?: Player }[] {
  const left = [...roster].sort((a, b) => points(b) - points(a));
  const take = (slot: string, eligible: Position[]) => {
    const i = left.findIndex((p) => eligible.includes(p.position));
    return { slot, player: i < 0 ? undefined : left.splice(i, 1)[0] };
  };
  const slots = [
    take("QB", ["QB"]),
    take("RB", ["RB"]),
    take("RB", ["RB"]),
    take("WR", ["WR"]),
    take("WR", ["WR"]),
  ];
  for (let i = 0; i < FLEX_SLOTS; i++) slots.push(take("FLEX", ["RB", "WR"]));
  slots.push(take("TE", ["TE"]), take("DST", ["DST"]), take("K", ["K"]));
  return [
    ...slots,
    ...Array.from({ length: Math.max(8, left.length) }, (_, i) => ({
      slot: "BN",
      player: left[i],
    })),
  ];
}
/** One label per empty starter slot, including FLEX only after base RB/WR needs. */
export function needs(roster: Player[]): string[] {
  return needsFromCounts(counts(roster));
}
/** The scenario engine shares this contract while simulating positional counts. */
export function needsFromCounts(c: Record<Position, number>): string[] {
  const result = POSITIONS.flatMap(
    (pos) => Array(Math.max(0, STARTERS[pos] - c[pos])).fill(pos) as string[],
  );
  const flexFilled =
    Math.max(0, c.RB - STARTERS.RB) + Math.max(0, c.WR - STARTERS.WR);
  return [
    ...result,
    ...Array(Math.max(0, FLEX_SLOTS - flexFilled)).fill("FLEX"),
  ];
}
/** Validate and return a candidate pick/correction with bounded undo history.
 * Seek forward to an empty pick, then wrap to earlier gaps. The UI deliberately
 * preserves the live clock for an earlier-board correction. Caller must persist.
 */
export function recordPick(
  state: DraftState,
  playerId: string,
  index = state.cursor,
): DraftState {
  if (!state.started) throw new Error("Start the draft in League setup first.");
  if (!Number.isInteger(index) || index < 0 || index >= state.picks.length)
    throw new Error("This pick is outside the draft.");
  if (keeperAssignments(state.league, state.players, state.keepers).has(index))
    throw new Error(
      "This pick is reserved for a keeper. Keepers are managed in pre-draft setup.",
    );
  if (!state.players.some((p) => p.id === playerId))
    throw new Error("Player was not found in the dataset.");
  if (state.picks.some((id, i) => id === playerId && i !== index))
    throw new Error("That player has already been drafted.");
  const picks = [...state.picks];
  picks[index] = playerId;
  const after = picks.findIndex((p, i) => i > index && p === null);
  const first = picks.indexOf(null);
  return {
    ...state,
    picks,
    cursor: after >= 0 ? after : first >= 0 ? first : picks.length,
    history: [
      ...state.history,
      { picks: [...state.picks], cursor: state.cursor },
    ].slice(-250),
  };
}
/** Undo a pick action only; current settings and player dataset stay in effect. */
export function undoPick(state: DraftState): DraftState {
  const previous = state.history.at(-1);
  return previous
    ? { ...state, ...previous, history: state.history.slice(0, -1) }
    : state;
}
export function validateLeague(league: League) {
  if (
    !league ||
    !Array.isArray(league.teams) ||
    league.teams.length !== TEAM_COUNT ||
    league.teams.some(
      (t) => typeof t !== "string" || !t.trim() || t.length > 40,
    )
  )
    throw new Error("Enter six team names (1–40 characters each).");
  if (
    new Set(league.teams.map((t) => t.trim().toLowerCase())).size !== TEAM_COUNT
  )
    throw new Error("Team names must be unique.");
  snakeOrder(league.order);
  if (
    !Number.isInteger(league.myTeam) ||
    league.myTeam < 0 ||
    league.myTeam >= TEAM_COUNT
  )
    throw new Error("Select your team.");
  if (
    !league.scoring ||
    Object.keys(defaultLeague().scoring).some(
      (k) =>
        !Number.isFinite(league.scoring[k as keyof League["scoring"]]) ||
        Math.abs(league.scoring[k as keyof League["scoring"]]) > 100,
    )
  )
    throw new Error(
      "Scoring values must be finite numbers between -100 and 100.",
    );
  if (typeof league.datasetLabel !== "string")
    throw new Error("Dataset label is missing.");
}
