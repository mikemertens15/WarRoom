import {
  BENCH_ALLOCATION,
  FLEX_SLOTS,
  MODEL,
  ROUNDS,
  STARTERS,
  TEAM_COUNT,
} from "./config";
import { counts, needs, nextPick, rosterFor, snakeOrder } from "./draft";
import {
  POSITIONS,
  type DraftState,
  type Player,
  type Position,
  type Recommendation,
  type Scoring,
  type ValuedPlayer,
} from "./types";

export function projectedPoints(p: Player, scoring: Scoring): number {
  if (!p.stats) return p.projection; // Aggregate projections must already match league scoring.
  return Object.entries(p.stats).reduce(
    (total, [key, value]) =>
      total +
      (value ?? 0) * (["dstPoints", "otherPoints"].includes(key) ? 1 : scoring[key as keyof Scoring]),
    0,
  );
}

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
      (p, i) => base[i] * (survival.get(p.id) ?? 0) * demand(p.position, c),
    );
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) continue;
    available.forEach((p, i) => {
      const removal = Math.min(survival.get(p.id)!, weights[i] / sum);
      survival.set(p.id, Math.max(0, survival.get(p.id)! - removal));
      c[p.position] += removal;
    });
  }
  return survival;
}

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
  const c = counts(roster);
  const open = needs(roster);
  const remaining = ROUNDS - roster.length;
  const ranked: Recommendation[] = available
    .map((p) => {
      const skill = p.position === "RB" || p.position === "WR";
      const fillsNeed =
        open.includes(p.position) || (skill && open.includes("FLEX"));
      const fit = fillsNeed
        ? MODEL.starterFit
        : skill
          ? MODEL.benchFit
          : c[p.position] < 2
            ? MODEL.singletonBackupFit
            : MODEL.surplusFit;
      const alternatives = available
        .filter((a) => a.id !== p.id && a.position === p.position)
        .sort((a, b) => b.value - a.value);
      // Independent-survival approximation for the expected best alternative.
      // Value is nonnegative VOR, so missing alternatives contribute replacement value (0).
      let noBetter = 1;
      let alternativeValue = 0;
      for (const a of alternatives) {
        const chance = survival.get(a.id) ?? 0;
        alternativeValue += noBetter * chance * a.value;
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
          : Math.max(0, p.value - alternativeValue) *
            (1 - chance) *
            MODEL.opportunityWeight *
            fit;
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
        p.value * fit +
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
  return `${p.position}${p.posRank} in the league model, ${p.vor.toFixed(1)} points above a ${p.baseline.toFixed(1)}-point replacement baseline. ${p.peers === 0 ? "Last available player in this positional tier." : `${p.peers} other players remain in this positional tier.`} ${hasNext ? `${selections} selections before your next turn; approximately ${Math.round(p.survival * 100)}% chance of returning. ${p.alternative ? `${p.alternative} is a likely alternative; the expected best alternative is worth ${p.alternativeValue.toFixed(1)} league-value points (starter VOR plus discounted depth).` : "No same-position alternative clears the survival threshold."}` : "No later pick remains; prioritize finishing your roster."} Roster fit applies a ${p.fit.toFixed(2)}× multiplier. Availability estimates are heuristic, not calibrated odds.`;
}
