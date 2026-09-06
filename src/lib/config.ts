import type { League, Position, Scoring } from "./types";
export const TEAM_COUNT = 6;
export const ROUNDS = 18; // 10 starters + 8 bench. IR is not a draft slot.
export const STARTERS: Record<Position, number> = { QB: 1, RB: 2, WR: 2, TE: 1, DST: 1, K: 1 };
export const FLEX_SLOTS = 2; // RB / WR only, per this league's requested model.
export const BENCH_ALLOCATION: Record<Position, number> = { QB: 1, RB: 3, WR: 3, TE: 1, DST: 0, K: 0 }; // Eight reserve slots per team; valuation assumption, not roster limits.
export const DEFAULT_SCORING: Scoring = {
  receptions: 1, passTD: 4, rushTD: 6, recTD: 6, passYards: .04,
  rushYards: .1, recYards: .1, interceptions: -2, fumblesLost: -2,
  fgYards: .1, extraPoints: 1,
};
/** All tunable heuristic coefficients. Units are projected season points unless noted.
 * Survival is a sequential, weighted-choice approximation, NOT calibrated odds.
 * Keep changes here and document them in README; never disguise model precision.
 */
export const MODEL = {
  tierGap: 22,
  depthWeight: .2, // Discounted VOR beyond the projected league-wide bench cutoff.
  adpTemperature: 13,
  rankAdpBlend: .25,
  opponentUnfilled: 1.65, opponentFilled: .55, opponentBackup: .22,
  opportunityWeight: .85, tierCliffBonus: 7,
  starterFit: 1, benchFit: .42, singletonBackupFit: .14, surplusFit: .04,
  needBonus: 12, requiredSlotBonus: 200,
  upsideWeight: 8, riskWeight: 16,
  lowSurvival: .35, highSurvival: .70, strongValue: 65,
  alternativeSurvival: .45,
};
export function defaultLeague(): League {
  return { teams: ["My Team", "Sunday Scaries", "Fourth & Long", "Red Zone Club", "The Underdogs", "Bye Week Bandits"], myTeam: 0, order: [0, 1, 2, 3, 4, 5], scoring: { ...DEFAULT_SCORING }, datasetLabel: "Demo pool · fictional projections" };
}
