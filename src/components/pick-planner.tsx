"use client";

import { useMemo, useState } from "react";
import { MODEL } from "@/lib/config";
import { comparePickPlans } from "@/lib/planner";
import { opponentTendencies, type recommend } from "@/lib/engine";
import type { DraftState } from "@/lib/types";
import { fmt, pct } from "./ui";

/** Scenario work is opt-in and memoized by draft state, so typing player names
 * never reruns simulations. This panel compares plans; it never records a pick.
 */
export default function PickPlanner({
  state,
  model,
}: {
  state: DraftState;
  model: ReturnType<typeof recommend>;
}) {
  const [open, setOpen] = useState(false);
  const comparison = useMemo(
    () => (open ? comparePickPlans(state, model) : null),
    [open, state, model],
  );
  return (
    <details
      className="panel pick-planner"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        Think two picks ahead <span>Compare draft paths</span>
      </summary>
      {comparison && (
        <div className="planner-content">
          <h3>{comparison.verdict}</h3>
          {comparison.reason ? (
            <p>{comparison.reason}</p>
          ) : (
            <>
              <p>
                {comparison.scenarios} opponent-choice scenarios through your
                pick #{comparison.target! + 1}. Higher gain means a stronger
                projected lineup and useful bench depth.
              </p>
              <ol className="plan-list">
                {comparison.plans.slice(0, 4).map((plan) => (
                  <li key={plan.playerId}>
                    <div>
                      <strong>{plan.name}</strong>
                      <span>
                        {plan.position} · +{fmt(plan.immediateGain)} now
                      </span>
                    </div>
                    <p>
                      Then {plan.nextName ?? "best remaining fit"}
                      {plan.nextName
                        ? ` (${pct(plan.nextShare)} of scenarios)`
                        : ""}
                    </p>
                    <div className="plan-metrics">
                      <span>
                        <b>+{fmt(plan.meanGain)}</b> average combined gain
                      </span>
                      <span>
                        {fmt(plan.lowGain)}–{fmt(plan.highGain)} middle 80%
                        range
                      </span>
                    </div>
                    <small>
                      Within {MODEL.planTie} points of the best tested path in{" "}
                      {pct(plan.bestShare)} of scenarios.
                    </small>
                  </li>
                ))}
              </ol>
              <p className="help-text">
                These are sensitivity checks, not win probabilities or
                guaranteed availability. Scenarios vary market concentration and
                opponent choices; player projections stay fixed. Compare the top
                recommendation’s risk and tier notes before choosing.
              </p>
            </>
          )}
        </div>
      )}
    </details>
  );
}

/** Keep learned preferences inspectable; reservations affect needs but are never
 * counted as evidence of a manager's live-draft behavior.
 */
export function OpponentLearning({
  state,
  model,
}: {
  state: DraftState;
  model: ReturnType<typeof recommend>;
}) {
  const teams = useMemo(
    () => opponentTendencies(state, model.valuation.players),
    [state, model],
  );
  return (
    <div className="opponent-learning">
      <h3>What the room is showing us</h3>
      <p>
        Preferences remain neutral until {MODEL.opponentMinPicks} live choices
        per team, then adjust gently against market rank and roster needs.
        Keepers do not count as live choices.
      </p>
      <ul>
        {teams.map((team, i) =>
          i === state.league.myTeam ? null : (
            <li key={i}>
              <strong>{state.league.teams[i]}</strong>
              <span>
                {team.livePicks} live picks ·{" "}
                {team.livePicks < MODEL.opponentMinPicks
                  ? "Neutral forecast"
                  : Object.entries(team.factors)
                      .map(([pos, factor]) => `${pos} ${factor.toFixed(2)}×`)
                      .join(" · ")}
              </span>
            </li>
          ),
        )}
      </ul>
      <p className="help-text">
        Factors scale positional demand, bounded to {MODEL.opponentBiasMin}–
        {MODEL.opponentBiasMax}×. They describe observed choices, not fixed
        manager identities.
      </p>
    </div>
  );
}
