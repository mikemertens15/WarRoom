import { FLEX_SLOTS, ROUNDS, STARTERS, TEAM_COUNT, defaultLeague } from "./config";
import { samplePlayers } from "./sample";
import { POSITIONS, type DraftState, type League, type PickSlot, type Player, type Position } from "./types";
export function snakeOrder(order: number[], rounds = ROUNDS): PickSlot[] {
  if (order.length !== TEAM_COUNT || new Set(order).size !== TEAM_COUNT || order.some(t => !Number.isInteger(t) || t < 0 || t >= TEAM_COUNT)) throw new Error("Draft order must contain each of the six teams exactly once.");
  return Array.from({ length: rounds * TEAM_COUNT }, (_, i) => {
    const round = Math.floor(i / TEAM_COUNT);
    const seat = round % 2 ? TEAM_COUNT - 1 - i % TEAM_COUNT : i % TEAM_COUNT;
    return { overall: i + 1, round: round + 1, seat: seat + 1, team: order[seat] };
  });
}
export function nextPick(order: PickSlot[], from: number, team: number, strictlyAfter = false, picks?: (string | null)[]): number | null {
  const i = order.findIndex((p, i) => i >= from + Number(strictlyAfter) && p.team === team && (!picks || picks[i] === null));
  return i === -1 ? null : i;
}
export function newDraft(league = defaultLeague(), players = samplePlayers()): DraftState {
  return { version: 1, league, players, picks: Array(TEAM_COUNT * ROUNDS).fill(null), cursor: 0, started: false, history: [], updatedAt: new Date().toISOString(), revision: "initial" };
}
export function availablePlayers(state: DraftState): Player[] {
  const selected = new Set(state.picks.filter(Boolean));
  return state.players.filter(p => !selected.has(p.id));
}
export function rosterFor(state: DraftState, team: number): Player[] {
  const order = snakeOrder(state.league.order);
  const map = new Map(state.players.map(p => [p.id, p]));
  return state.picks.flatMap((id, i) => id && order[i].team === team && map.has(id) ? [map.get(id)!] : []);
}
export function counts(roster: Player[]): Record<Position, number> {
  return Object.fromEntries(POSITIONS.map(pos => [pos, roster.filter(p => p.position === pos).length])) as Record<Position, number>;
}
export function rosterSlots(roster: Player[], points: (p: Player) => number = p => p.projection): { slot: string; player?: Player }[] {
  const left = [...roster].sort((a, b) => points(b) - points(a));
  const take = (slot: string, eligible: Position[]) => {
    const i = left.findIndex(p => eligible.includes(p.position));
    return { slot, player: i < 0 ? undefined : left.splice(i, 1)[0] };
  };
  const slots = [take("QB", ["QB"]), take("RB", ["RB"]), take("RB", ["RB"]), take("WR", ["WR"]), take("WR", ["WR"])];
  for (let i = 0; i < FLEX_SLOTS; i++) slots.push(take("FLEX", ["RB", "WR"]));
  slots.push(take("TE", ["TE"]), take("DST", ["DST"]), take("K", ["K"]));
  return [...slots, ...Array.from({ length: Math.max(8, left.length) }, (_, i) => ({ slot: "BN", player: left[i] }))];
}
export function needs(roster: Player[]): string[] {
  const c = counts(roster);
  const result = POSITIONS.flatMap(pos => Array(Math.max(0, STARTERS[pos] - c[pos])).fill(pos) as string[]);
  const flexFilled = Math.max(0, c.RB - STARTERS.RB) + Math.max(0, c.WR - STARTERS.WR);
  return [...result, ...Array(Math.max(0, FLEX_SLOTS - flexFilled)).fill("FLEX")];
}
export function recordPick(state: DraftState, playerId: string, index = state.cursor): DraftState {
  if (!state.started) throw new Error("Start the draft in League setup first.");
  if (!Number.isInteger(index) || index < 0 || index >= state.picks.length) throw new Error("This pick is outside the draft.");
  if (!state.players.some(p => p.id === playerId)) throw new Error("Player was not found in the dataset.");
  if (state.picks.some((id, i) => id === playerId && i !== index)) throw new Error("That player has already been drafted.");
  const picks = [...state.picks]; picks[index] = playerId;
  const after = picks.findIndex((p, i) => i > index && p === null);
  const first = picks.indexOf(null);
  return { ...state, picks, cursor: after >= 0 ? after : first >= 0 ? first : picks.length, history: [...state.history, { picks: [...state.picks], cursor: state.cursor }].slice(-250) };
}
export function undoPick(state: DraftState): DraftState {
  const previous = state.history.at(-1);
  return previous ? { ...state, ...previous, history: state.history.slice(0, -1) } : state;
}
export function validateLeague(league: League) {
  if (!league || !Array.isArray(league.teams) || league.teams.length !== TEAM_COUNT || league.teams.some(t => typeof t !== "string" || !t.trim() || t.length > 40)) throw new Error("Enter six team names (1–40 characters each).");
  if (new Set(league.teams.map(t => t.trim().toLowerCase())).size !== TEAM_COUNT) throw new Error("Team names must be unique.");
  snakeOrder(league.order);
  if (!Number.isInteger(league.myTeam) || league.myTeam < 0 || league.myTeam >= TEAM_COUNT) throw new Error("Select your team.");
  if (!league.scoring || Object.keys(defaultLeague().scoring).some(k => !Number.isFinite(league.scoring[k as keyof League["scoring"]]) || Math.abs(league.scoring[k as keyof League["scoring"]]) > 100)) throw new Error("Scoring values must be finite numbers between -100 and 100.");
  if (typeof league.datasetLabel !== "string") throw new Error("Dataset label is missing.");
}
