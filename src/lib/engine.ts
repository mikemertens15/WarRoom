import {
  BENCH_ALLOCATION,
  FLEX_SLOTS,
  MODEL,
  ROUNDS,
  STARTERS,
  TEAM_COUNT,
} from "./config";
import {
  counts,
  needs,
  nextPick,
  rosterFor,
  rosterSlots,
  snakeOrder,
} from "./draft";
import {
  POSITIONS,
  type DraftState,
  type Player,
  type Position,
  type Recommendation,
  type Scoring,
  type ValuedPlayer,
} from "./types";

/** Rescore only a supplied stat breakdown. Fixed source point adjustments retain
 * multiplier 1; an aggregate-only player cannot be converted to other scoring.
 */
export function projectedPoints(p: Player, scoring: Scoring): number {
  if (!p.stats) return p.projection; // Aggregate projections must already match league scoring.
  return Object.entries(p.stats).reduce(
    (total, [key, value]) =>
      total +
      (value ?? 0) *
        (["dstPoints", "otherPoints"].includes(key)
          ? 1
          : scoring[key as keyof Scoring]),
    0,
  );
}

/** Compute stable baselines from the entire original pool, not available players.
 * Base RB/WR starters are reserved before FLEX allocation. Positive starter VOR
 * plus discounted bench depth determines value; signed VOR stays visible for audit.
 */
export function valuePlayers(players: Player[], scoring: Scoring) {
  const groups = Object.fromEntries(
    POSITIONS.map((pos) => [
      pos,
      players
        .filter((p) => p.position === pos)
        .map((p) => ({ ...p, points: projectedPoints(p, scoring) }))
        .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id)),
    ]),
  ) as Record<Position, (Player & { points: number })[]>;
  const flexPool = [
    ...groups.RB.slice(TEAM_COUNT * STARTERS.RB),
    ...groups.WR.slice(TEAM_COUNT * STARTERS.WR),
  ].sort((a, b) => b.points - a.points);
  const flexStarters = flexPool.slice(0, TEAM_COUNT * FLEX_SLOTS);
  const flexBaseline =
    flexPool[TEAM_COUNT * FLEX_SLOTS]?.points ?? flexPool.at(-1)?.points ?? 0;
  const replacement = {} as Record<Position, number>;
  const replacementRank = {} as Record<Position, number>;
  const result: ValuedPlayer[] = [];
  for (const pos of POSITIONS) {
    const extra = flexStarters.filter((p) => p.position === pos).length;
    const index = TEAM_COUNT * STARTERS[pos] + extra;
    replacementRank[pos] = index + 1;
    replacement[pos] =
      groups[pos][index]?.points ?? groups[pos].at(-1)?.points ?? 0;
    let computedTier = 1;
    let tierTop = groups[pos][0]?.points ?? 0;
    groups[pos].forEach((p, i) => {
      if (tierTop - p.points > MODEL.tierGap) {
        computedTier++;
        tierTop = p.points;
      }
      const flexEligible = pos === "RB" || pos === "WR";
      const baseline = flexEligible
        ? Math.min(replacement[pos], flexBaseline)
        : replacement[pos];
      const vor = p.points - baseline;
      const benchBaseline =
        groups[pos][index + TEAM_COUNT * BENCH_ALLOCATION[pos]]?.points ??
        groups[pos].at(-1)?.points ??
        0;
      const depthValue =
        Math.max(0, p.points - benchBaseline) * MODEL.depthWeight;
      result.push({
        ...p,
        modelRank: 0,
        posRank: i + 1,
        modelTier: p.tier ?? computedTier,
        baseline,
        vor,
        benchBaseline,
        depthValue,
        value: Math.max(0, vor) + depthValue,
        flexValue: flexEligible ? Math.max(0, p.points - flexBaseline) : 0,
      });
    });
  }
  result.sort(
    (a, b) =>
      b.value - a.value || b.points - a.points || a.id.localeCompare(b.id),
  );
  result.forEach((p, i) => {
    p.modelRank = i + 1;
  });
  return { players: result, replacement, replacementRank, flexBaseline };
}

/** Roster utility uses a replacement-filled starting lineup plus useful reserves.
 * Empty/weak starter slots retain the replacement baseline. Bench players earn
 * discounted value above the deep-pool cutoff, with diminishing same-position depth.
 * This is season-point utility, not predicted weekly wins or injury probabilities.
 */
export function rosterUtility(
  roster: ValuedPlayer[],
  valuation: ReturnType<typeof valuePlayers>,
) {
  const slots = rosterSlots(roster, (p) => (p as ValuedPlayer).points);
  let starter = 0,
    bench = 0;
  const reserves = Object.fromEntries(
    POSITIONS.map((pos) => [pos, 0]),
  ) as Record<Position, number>;
  for (const slot of slots) {
    const p = slot.player as ValuedPlayer | undefined;
    if (slot.slot === "BN") {
      if (p) bench += p.depthValue * MODEL.benchDecay ** reserves[p.position]++;
    } else {
      const baseline =
        slot.slot === "FLEX"
          ? valuation.flexBaseline
          : valuation.replacement[slot.slot as Position];
      starter += Math.max(baseline, p?.points ?? baseline) - baseline;
    }
  }
  return { starter, bench, total: starter + bench };
}

/** Marginal contribution includes displaced starters becoming reserves, rather
 * than applying a fixed "already have a QB" discount to a legitimate upgrade.
 */
export function rosterGains(
  roster: ValuedPlayer[],
  candidates: ValuedPlayer[],
  valuation: ReturnType<typeof valuePlayers>,
) {
  const before = rosterUtility(roster, valuation);
  return new Map(
    candidates.map((p) => {
      const after = rosterUtility([...roster, p], valuation);
      return [
        p.id,
        {
          starterGain: after.starter - before.starter,
          benchGain: after.bench - before.bench,
          rosterGain: Math.max(0, after.total - before.total),
        },
      ];
    }),
  );
}

/** Exclude the current user's selection but include a current opponent selection.
 * Manually filled future picks are skipped, and no later turn means no urgency.
 */
export function forecastWindow(state: DraftState) {
  const order = snakeOrder(state.league.order);
  const onClock = order[state.cursor];
  const mineNow = onClock?.team === state.league.myTeam;
  const target = nextPick(
    order,
    state.cursor,
    state.league.myTeam,
    mineNow,
    state.picks,
  );
  const between =
    target === null
      ? []
      : order
          .slice(state.cursor + Number(mineNow), target)
          .filter((slot) => state.picks[slot.overall - 1] === null);
  return { target, between, mineNow, selections: between.length };
}

function demand(pos: Position, c: Record<Position, number>): number {
  if (c[pos] < STARTERS[pos]) return MODEL.opponentUnfilled;
  if (
    (pos === "RB" || pos === "WR") &&
    c.RB + c.WR < STARTERS.RB + STARTERS.WR + FLEX_SLOTS
  )
    return MODEL.opponentUnfilled;
  return c[pos] >= STARTERS[pos] + 1
    ? MODEL.opponentBackup
    : MODEL.opponentFilled;
}
export const opponentDemand = demand;

/** Bounded learning from live choices only. Compare observed positions with the
 * market/need distribution at each recorded selection; keeper ownership informs
 * needs but is not evidence of a live drafting preference. Prior weight prevents
 * a few early picks from turning into an overconfident opponent profile.
 */
export function opponentTendencies(state: DraftState, players: ValuedPlayer[]) {
  const neutral = () =>
    Object.fromEntries(POSITIONS.map((pos) => [pos, 0])) as Record<
      Position,
      number
    >;
  const count = state.league.teams.map(neutral),
    observed = state.league.teams.map(neutral),
    expected = state.league.teams.map(neutral);
  const livePicks = Array(TEAM_COUNT).fill(0);
  const kept = new Set(state.keepers.map((k) => k.playerId));
  const map = new Map(players.map((p) => [p.id, p]));
  for (const k of state.keepers) count[k.team][map.get(k.playerId)!.position]++;
  const available = new Set(
    players.filter((p) => !kept.has(p.id)).map((p) => p.id),
  );
  const order = snakeOrder(state.league.order);
  const market = new Map(
    players.map((p) => [
      p.id,
      p.adp === undefined
        ? (p.consensusRank ?? p.modelRank)
        : p.adp * (1 - MODEL.rankAdpBlend) + p.modelRank * MODEL.rankAdpBlend,
    ]),
  );
  state.picks.forEach((id, index) => {
    if (!id || kept.has(id)) return;
    const team = order[index].team,
      p = map.get(id)!;
    const weights = neutral();
    const earliest = Math.min(
      ...[...available].map((candidate) => market.get(candidate)!),
    );
    for (const candidate of available) {
      const a = map.get(candidate)!;
      weights[a.position] +=
        Math.exp(
          -Math.min(
            700,
            (market.get(candidate)! - earliest) / MODEL.adpTemperature,
          ),
        ) * demand(a.position, count[team]);
    }
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const pos of POSITIONS)
      expected[team][pos] += sum > 0 ? weights[pos] / sum : 0;
    observed[team][p.position]++;
    count[team][p.position]++;
    livePicks[team]++;
    available.delete(id);
  });
  return state.league.teams.map((_, team) => ({
    livePicks: livePicks[team],
    factors: Object.fromEntries(
      POSITIONS.map((pos) => {
        const share =
          (STARTERS[pos] +
            BENCH_ALLOCATION[pos] +
            (["RB", "WR"].includes(pos) ? FLEX_SLOTS / 2 : 0)) /
          ROUNDS;
        const ratio =
          (MODEL.opponentPrior * share + observed[team][pos]) /
          (MODEL.opponentPrior * share + expected[team][pos]);
        return [
          pos,
          livePicks[team] < MODEL.opponentMinPicks
            ? 1
            : Math.max(
                MODEL.opponentBiasMin,
                Math.min(MODEL.opponentBiasMax, ratio),
              ),
        ];
      }),
    ) as Record<Position, number>,
  }));
}

/** Capped weighted allocation conserves one expected selection. Redistribute
 * excess when a player's share would exceed its remaining survival mass.
 */
export function expectedRemoval(
  capacity: number[],
  weights: number[],
): number[] {
  const result = capacity.map(() => 0);
  let remaining = Math.min(
    1,
    capacity.reduce((a, b) => a + b, 0),
  );
  let active = capacity
    .map((_, i) => i)
    .filter((i) => capacity[i] > 0 && weights[i] > 0);
  while (remaining > 1e-12 && active.length) {
    const sum = active.reduce((total, i) => total + weights[i], 0);
    const capped = active.filter(
      (i) => (remaining * weights[i]) / sum > capacity[i] - result[i],
    );
    if (!capped.length) {
      for (const i of active) result[i] += (remaining * weights[i]) / sum;
      break;
    }
    for (const i of capped) {
      const take = capacity[i] - result[i];
      result[i] += take;
      remaining -= take;
    }
    active = active.filter((i) => !capped.includes(i));
  }
  return result;
}

/** Each intervening opponent pick removes one expected player from the pool.
 * Expected positional counts update after each pick, including repeated teams.
 * ADP is softly blended with league rank; without ADP use consensus or model rank.
 */
export function survivalForecast(
  state: DraftState,
  available: ValuedPlayer[],
  slots = forecastWindow(state).between,
): Map<string, number> {
  const survival = new Map(available.map((p) => [p.id, 1]));
  const rosters = state.league.teams.map((_, team) =>
    counts(rosterFor(state, team)),
  );
  const tendencies = opponentTendencies(
    state,
    valuePlayers(state.players, state.league.scoring).players,
  );
  const market = available.map((p) =>
    p.adp === undefined
      ? (p.consensusRank ?? p.modelRank)
      : p.adp * (1 - MODEL.rankAdpBlend) + p.modelRank * MODEL.rankAdpBlend,
  );
  const earliest = Math.min(...market);
  const base = market.map((rank) =>
    Math.exp(-Math.min(700, (rank - earliest) / MODEL.adpTemperature)),
  );
  for (const slot of slots) {
    const c = rosters[slot.team];
    const weights = available.map(
      (p, i) =>
        base[i] *
        (survival.get(p.id) ?? 0) *
        demand(p.position, c) *
        tendencies[slot.team].factors[p.position],
    );
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) continue;
    const removals = expectedRemoval(
      available.map((p) => survival.get(p.id)!),
      weights,
    );
    available.forEach((p, i) => {
      const removal = removals[i];
      survival.set(p.id, Math.max(0, survival.get(p.id)! - removal));
      c[p.position] += removal;
    });
  }
  return survival;
}

/** Rank for the user's roster, regardless of which team is recording a pick.
 * Every score component is returned for UI audit. Eligibility guides suggestions;
 * recordPick still accepts unusual real-board choices. No persisted state mutates.
 */
export function recommend(state: DraftState): {
  ranked: Recommendation[];
  valuation: ReturnType<typeof valuePlayers>;
  window: ReturnType<typeof forecastWindow>;
} {
  const valuation = valuePlayers(state.players, state.league.scoring);
  const drafted = new Set(state.picks.filter(Boolean));
  const available = valuation.players.filter((p) => !drafted.has(p.id));
  const window = forecastWindow(state);
  const survival = survivalForecast(state, available, window.between);
  const roster = rosterFor(state, state.league.myTeam);
  const valued = new Map(valuation.players.map((p) => [p.id, p]));
  const gains = rosterGains(
    roster.map((p) => valued.get(p.id)!),
    available,
    valuation,
  );
  const open = needs(roster);
  const remaining = ROUNDS - roster.length;
  const ranked: Recommendation[] = available
    .map((p) => {
      const skill = p.position === "RB" || p.position === "WR";
      const fillsNeed =
        open.includes(p.position) || (skill && open.includes("FLEX"));
      const gain = gains.get(p.id)!;
      const fit = p.value > 0 ? Math.min(1, gain.rosterGain / p.value) : 0;
      const alternatives = available
        .filter((a) => a.id !== p.id && a.position === p.position)
        .sort(
          (a, b) => gains.get(b.id)!.rosterGain - gains.get(a.id)!.rosterGain,
        );
      // Independent-survival approximation for the expected best alternative.
      // Alternatives use marginal roster gain; no surviving alternative contributes zero.
      let noBetter = 1;
      let alternativeValue = 0;
      for (const a of alternatives) {
        const chance = survival.get(a.id) ?? 0;
        alternativeValue += noBetter * chance * gains.get(a.id)!.rosterGain;
        noBetter *= 1 - chance;
      }
      const likely = alternatives.find(
        (a) => (survival.get(a.id) ?? 0) >= MODEL.alternativeSurvival,
      );
      const chance = survival.get(p.id) ?? 1;
      const peers = alternatives.filter(
        (a) => a.modelTier === p.modelTier,
      ).length;
      const tierDrop = likely ? Math.max(0, likely.modelTier - p.modelTier) : 0;
      const urgency =
        window.target === null
          ? 0
          : Math.max(0, gain.rosterGain - alternativeValue) *
            (1 - chance) *
            MODEL.opportunityWeight;
      const tierAdjustment =
        window.target !== null && peers === 0 && tierDrop > 0
          ? MODEL.tierCliffBonus * (1 - chance) * fit
          : 0;
      const need = fillsNeed
        ? MODEL.needBonus +
          (remaining <= open.length ? MODEL.requiredSlotBonus : 0)
        : 0;
      const riskPenalty = (p.risk ?? 0) * MODEL.riskWeight;
      const upsideBonus = (p.upside ?? 0) * MODEL.upsideWeight * fit;
      const eligible = remaining > 0 && (remaining > open.length || fillsNeed);
      const score =
        gain.rosterGain +
        urgency +
        tierAdjustment +
        need +
        upsideBonus -
        riskPenalty;
      const statusLabel = !eligible
        ? "ROSTER FULL"
        : tierAdjustment > 0
          ? "TIER CLIFF"
          : chance < MODEL.lowSurvival
            ? "LIKELY GONE"
            : p.value > MODEL.strongValue
              ? "STRONG VALUE"
              : chance >= MODEL.highSurvival
                ? "WAIT"
                : "IN THE MIX";
      return {
        ...p,
        ...gain,
        survival: chance,
        score,
        fit,
        need,
        urgency,
        tierAdjustment,
        riskPenalty,
        upsideBonus,
        alternative: likely?.name,
        alternativeValue,
        tierDrop,
        peers,
        statusLabel,
        eligible,
      };
    })
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        b.score - a.score ||
        a.modelRank - b.modelRank,
    );
  if (ranked[0]?.eligible) ranked[0].statusLabel = "TAKE";
  return { ranked, valuation, window };
}

export function explanation(
  p: Recommendation,
  selections: number,
  hasNext: boolean,
): string {
  return `${p.position}${p.posRank} in the league model, ${p.vor.toFixed(1)} points above a ${p.baseline.toFixed(1)}-point replacement baseline. ${p.peers === 0 ? "Last available player in this positional tier." : `${p.peers} other players remain in this positional tier.`} ${hasNext ? `${selections} selections before your next turn; approximately ${Math.round(p.survival * 100)}% chance of returning. ${p.alternative ? `${p.alternative} is a likely alternative; the expected best alternative is worth ${p.alternativeValue.toFixed(1)} marginal roster-value points.` : "No same-position alternative clears the survival threshold."}` : "No later pick remains; prioritize finishing your roster."} Adding this player improves projected starter value by ${p.starterGain.toFixed(1)} and bench value by ${p.benchGain.toFixed(1)}, for ${p.rosterGain.toFixed(1)} total roster gain. Availability estimates are heuristic, not calibrated odds.`;
}
