import { MODEL, ROUNDS, defaultLeague } from "./config";
import {
  availablePlayers,
  needs,
  newDraft,
  recordPick,
  rosterFor,
  snakeOrder,
} from "./draft";
import { recommend } from "./engine";
import type { DraftState, Player } from "./types";
export function seededRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function simulateDraft(
  seat: number,
  seed = 42,
  players?: Player[],
): {
  state: DraftState;
  userSelections: number;
  forecasts: { chance: number; survived: boolean }[];
} {
  const league = defaultLeague();
  league.myTeam = seat;
  let state = { ...newDraft(league, players), started: true };
  const order = snakeOrder(league.order);
  const random = seededRandom(seed);
  let userSelections = 0;
  const pending: { target: number; id: string; chance: number }[] = [];
  const forecasts: { chance: number; survived: boolean }[] = [];
  while (state.cursor < 108) {
    for (const f of pending.filter((f) => f.target === state.cursor))
      forecasts.push({
        chance: f.chance,
        survived: !state.picks.includes(f.id),
      });
    let id: string;
    if (order[state.cursor].team === seat) {
      const model = recommend(state);
      const best = model.ranked.find((p) => p.eligible);
      if (!best || !Number.isFinite(best.score))
        throw new Error(`No valid recommendation at ${state.cursor + 1}.`);
      id = best.id;
      userSelections++;
      if (model.window.target !== null)
        model.ranked
          .filter((p) => p.id !== id)
          .slice(0, 5)
          .forEach((p) =>
            pending.push({
              target: model.window.target!,
              id: p.id,
              chance: p.survival,
            }),
          );
    } else {
      const roster = rosterFor(state, order[state.cursor].team);
      const open = needs(roster);
      const candidates = availablePlayers(state).filter(
        (p) =>
          ROUNDS - roster.length > open.length ||
          open.includes(p.position) ||
          (["RB", "WR"].includes(p.position) && open.includes("FLEX")),
      );
      const ranked = candidates.sort(
        (a, b) =>
          (a.adp ?? a.consensusRank ?? 9999) -
          (b.adp ?? b.consensusRank ?? 9999),
      );
      const weights = ranked.map(
        (p, i) =>
          Math.exp(-i / MODEL.adpTemperature) *
          (open.includes(p.position)
            ? MODEL.opponentUnfilled
            : MODEL.opponentFilled),
      );
      let target = random() * weights.reduce((a, b) => a + b, 0);
      let index = 0;
      while (index < weights.length - 1 && (target -= weights[index]) > 0)
        index++;
      if (!ranked[index])
        throw new Error("Opponent exhausted eligible player pool.");
      id = ranked[index].id;
    }
    state = recordPick(state, id);
  }
  return { state, userSelections, forecasts };
}
