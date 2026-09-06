/** Deterministic two-pick scenario comparison. Football projections stay fixed;
 * scenarios vary opponent choices and market concentration, not player outcomes.
 * Results are sensitivity summaries, never calibrated probabilities of winning.
 */
import { MODEL, ROUNDS } from "./config";
import { counts, needs, needsFromCounts, rosterFor, snakeOrder } from "./draft";
import {
  opponentDemand,
  opponentTendencies,
  rosterGains,
  rosterUtility,
  type recommend,
} from "./engine";
import type { DraftState, Position, ValuedPlayer } from "./types";

export interface PickPlan {
  playerId: string;
  name: string;
  position: Position;
  immediateGain: number;
  meanGain: number;
  lowGain: number;
  highGain: number;
  bestShare: number;
  nextName?: string;
  nextShare: number;
}
export interface PlanComparison {
  plans: PickPlan[];
  scenarios: number;
  target: number | null;
  reason?: string;
  verdict: string;
}
const random = (scenario: number, step: number) => {
  let x =
    Math.imul(scenario + 731, 1597334677) ^ Math.imul(step + 911, 3812015801);
  x = Math.imul(x ^ (x >>> 16), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

export function comparePickPlans(
  state: DraftState,
  model: ReturnType<typeof recommend>,
): PlanComparison {
  const order = snakeOrder(state.league.order);
  if (order[state.cursor]?.team !== state.league.myTeam)
    return {
      plans: [],
      scenarios: 0,
      target: null,
      reason: "Two-pick comparisons open when your team is on the clock.",
      verdict: "Waiting for your turn",
    };
  const target = model.window.target;
  if (state.picks[state.cursor] !== null)
    return {
      plans: [],
      scenarios: 0,
      target,
      reason:
        "Move the clock to an open live pick before comparing draft paths.",
      verdict: "This pick is already filled",
    };
  if (target === null)
    return {
      plans: [],
      scenarios: 0,
      target,
      reason: "No later live pick remains. Use immediate roster improvement.",
      verdict: "Final live pick",
    };
  if (state.picks.slice(0, state.cursor).some((p) => p === null))
    return {
      plans: [],
      scenarios: 0,
      target,
      reason: "Fill earlier draft gaps before comparing pick sequences.",
      verdict: "Earlier picks missing",
    };
  const eligible = model.ranked.filter((p) => p.eligible);
  const candidates = [
    ...new Map(
      [
        ...eligible.slice(0, MODEL.planCandidates),
        ...["QB", "RB", "WR", "TE", "DST", "K"].flatMap(
          (pos) => eligible.find((p) => p.position === pos) ?? [],
        ),
      ].map((p) => [p.id, p]),
    ).values(),
  ];
  const valuation = model.valuation,
    byId = new Map(valuation.players.map((p) => [p.id, p]));
  const roster = rosterFor(state, state.league.myTeam).map(
    (p) => byId.get(p.id)!,
  );
  const base = rosterUtility(roster, valuation).total;
  const opponentCounts = state.league.teams.map((_, team) =>
    counts(rosterFor(state, team)),
  );
  const tendencies = opponentTendencies(state, valuation.players);
  const available = model.ranked;
  const market = available.map((p) =>
    p.adp === undefined
      ? (p.consensusRank ?? p.modelRank)
      : p.adp * (1 - MODEL.rankAdpBlend) + p.modelRank * MODEL.rankAdpBlend,
  );
  const earliest = Math.min(...market);
  // Only three market weight vectors are needed across all candidates/scenarios.
  const marketWeights = MODEL.planTemperatures.map((multiplier) =>
    market.map((rank) =>
      Math.exp(
        -Math.min(700, (rank - earliest) / (MODEL.adpTemperature * multiplier)),
      ),
    ),
  );
  const samples: number[][] = [],
    seconds: Map<string, number>[] = [];
  for (const candidate of candidates) {
    const afterFirst = [...roster, candidate];
    const gains = rosterGains(
      afterFirst,
      available.filter((p) => p.id !== candidate.id),
      valuation,
    );
    const open = needs(afterFirst),
      remaining = ROUNDS - afterFirst.length;
    const nextOptions = available
      .filter(
        (p) =>
          p.id !== candidate.id &&
          (remaining > open.length ||
            open.includes(p.position) ||
            (["RB", "WR"].includes(p.position) && open.includes("FLEX"))),
      )
      .sort(
        (a, b) =>
          gains.get(b.id)!.rosterGain - gains.get(a.id)!.rosterGain ||
          b.score - a.score,
      );
    const values: number[] = [],
      partners = new Map<string, number>();
    for (let scenario = 0; scenario < MODEL.planScenarios; scenario++) {
      const baseWeights = marketWeights[scenario % marketWeights.length];
      const removed = new Set([candidate.id]);
      const countsNow = opponentCounts.map((c) => ({ ...c }));
      for (const [step, slot] of model.window.between.entries()) {
        const c = countsNow[slot.team];
        const rosterSize = Object.values(c).reduce((a, b) => a + b, 0);
        const openSlots = needsFromCounts(c);
        const weights = available.map((p, i) =>
          removed.has(p.id) ||
          (ROUNDS - rosterSize <= openSlots.length &&
            !openSlots.includes(p.position) &&
            !(["RB", "WR"].includes(p.position) && openSlots.includes("FLEX")))
            ? 0
            : baseWeights[i] *
              opponentDemand(p.position, c) *
              tendencies[slot.team].factors[p.position],
        );
        let draw = random(scenario, step) * weights.reduce((a, b) => a + b, 0);
        let chosen: ValuedPlayer | undefined;
        for (let i = 0; i < weights.length; i++) {
          if (weights[i] > 0) {
            draw -= weights[i];
            chosen = available[i];
            if (draw <= 0) break;
          }
        }
        if (chosen) {
          removed.add(chosen.id);
          c[chosen.position]++;
        }
      }
      const next = nextOptions.find((p) => !removed.has(p.id));
      values.push(
        rosterUtility(next ? [...afterFirst, next] : afterFirst, valuation)
          .total - base,
      );
      if (next) partners.set(next.name, (partners.get(next.name) ?? 0) + 1);
    }
    samples.push(values);
    seconds.push(partners);
  }
  const best = Array.from({ length: MODEL.planScenarios }, (_, scenario) =>
    Math.max(...samples.map((values) => values[scenario])),
  );
  const plans = candidates
    .map((p, i) => {
      const sorted = [...samples[i]].sort((a, b) => a - b);
      const partner = [...seconds[i]].sort((a, b) => b[1] - a[1])[0];
      return {
        playerId: p.id,
        name: p.name,
        position: p.position,
        immediateGain: p.rosterGain,
        meanGain: samples[i].reduce((a, b) => a + b, 0) / MODEL.planScenarios,
        lowGain: sorted[Math.floor(sorted.length * MODEL.planLowQuantile)],
        highGain: sorted[Math.floor(sorted.length * MODEL.planHighQuantile)],
        bestShare:
          samples[i].filter(
            (value, scenario) => best[scenario] - value <= MODEL.planTie,
          ).length / MODEL.planScenarios,
        nextName: partner?.[0],
        nextShare: (partner?.[1] ?? 0) / MODEL.planScenarios,
      };
    })
    .sort(
      (a, b) => b.meanGain - a.meanGain || b.immediateGain - a.immediateGain,
    );
  const gap =
    plans.length > 1 ? plans[0].meanGain - plans[1].meanGain : Infinity;
  return {
    plans,
    scenarios: MODEL.planScenarios,
    target,
    verdict:
      gap < MODEL.planTie
        ? "Close call — several paths are comparable"
        : plans[0]?.bestShare >= MODEL.planConsistentShare
          ? "Consistent lead in tested scenarios"
          : "Sensitive to who your opponents take",
  };
}
