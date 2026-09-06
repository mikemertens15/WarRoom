"use client";
import { ArrowRight, Grid2X2 } from "lucide-react";
import { ROUNDS } from "@/lib/config";
import {
  counts,
  keeperAssignments,
  needs,
  rosterFor,
  snakeOrder,
} from "@/lib/draft";
import { forecastWindow } from "@/lib/engine";
import { POSITIONS, type DraftState, type Player } from "@/lib/types";
import { PositionBadge } from "./ui";

/** Display-only projection of chronological picks into snake-order board columns.
 * Editing passes an index upward; this component never stores competing rosters.
 */
export default function DraftBoard({
  state,
  full,
  onEdit,
  onExpand,
}: {
  state: DraftState;
  full: boolean;
  onEdit: (i: number) => void;
  onExpand: () => void;
}) {
  const order = snakeOrder(state.league.order);
  const players = new Map(state.players.map((p) => [p.id, p]));
  const currentRound = Math.min(17, Math.floor(state.cursor / 6));
  const rounds = full
    ? Array.from({ length: ROUNDS }, (_, i) => i)
    : Array.from(
        { length: Math.min(3, ROUNDS - Math.max(0, currentRound - 1)) },
        (_, i) => Math.max(0, currentRound - 1) + i,
      );
  const before = new Set(forecastWindow(state).between.map((s) => s.team));
  return (
    <section className="panel board-panel">
      <div className="panel-heading">
        <h2>
          <Grid2X2 size={17} /> League draft board
        </h2>
        <div className="board-key">
          <span className="dot" /> Your team{" "}
          {!full && (
            <button onClick={onExpand}>
              Full board <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="board-scroll">
        <div className="board-grid">
          <div className="round-header">ROUND</div>
          {state.league.order.map((team) => {
            const c = counts(rosterFor(state, team));
            return (
              <div
                className={`board-team ${team === state.league.myTeam ? "my-team" : ""}`}
                key={team}
              >
                <strong>
                  {state.league.teams[team]}
                  {team === state.league.myTeam && (
                    <span className="you-tag">YOU</span>
                  )}
                </strong>
                <span>
                  {POSITIONS.map((pos) => (
                    <small key={pos} className={`text-${pos.toLowerCase()}`}>
                      {pos} {c[pos]}
                    </small>
                  ))}
                </span>
                <small className="team-needs">
                  {before.has(team) ? "↑ Picks before your next turn · " : ""}
                  Needs:{" "}
                  {[...new Set(needs(rosterFor(state, team)))].join(" / ") ||
                    "Bench"}
                </small>
              </div>
            );
          })}
          {rounds.map((round) => (
            <BoardRound
              key={round}
              round={round}
              state={state}
              order={order}
              players={players}
              onEdit={onEdit}
            />
          ))}
        </div>
      </div>
      <div className="table-footer">
        <span>
          Click a live pick to add or correct a player. Edit keepers in League
          setup before live drafting. Corrections preserve the current clock.
        </span>
        <span>18 rounds · 108 picks</span>
      </div>
    </section>
  );
}
function BoardRound({
  round,
  state,
  order,
  players,
  onEdit,
}: {
  round: number;
  state: DraftState;
  order: ReturnType<typeof snakeOrder>;
  players: Map<string, Player>;
  onEdit: (i: number) => void;
}) {
  return (
    <>
      <div className="round-label">
        {String(round + 1).padStart(2, "0")}
        {round % 2 ? (
          <ArrowRight size={13} style={{ transform: "rotate(180deg)" }} />
        ) : (
          <ArrowRight size={13} />
        )}
      </div>
      {state.league.order.map((team) => {
        const index = order.findIndex(
          (s) => s.round === round + 1 && s.team === team,
        );
        const p = players.get(state.picks[index] ?? "");
        const keeper = keeperAssignments(
          state.league,
          state.players,
          state.keepers,
        ).has(index);
        return (
          <button
            disabled={!state.started || keeper}
            data-keeper={keeper || undefined}
            className={`board-cell ${p ? `picked border-${p.position.toLowerCase()}` : "unpicked"} ${index === state.cursor ? "on-clock" : ""} ${team === state.league.myTeam ? "my-column" : ""}`}
            key={team}
            onClick={() => onEdit(index)}
            aria-label={`${keeper ? "Keeper" : "Edit"} pick ${index + 1}${p ? `, ${p.name}` : ""}`}
          >
            <span className="pick-number">
              {round + 1}.{String((index % 6) + 1).padStart(2, "0")}{" "}
              <span>#{index + 1}</span>
            </span>
            {p ? (
              <>
                <strong>{p.name}</strong>
                <span className="board-player-meta">
                  <PositionBadge pos={p.position} />
                  {p.team}
                  {keeper && <span className="keeper-tag">KEEPER</span>}
                </span>
              </>
            ) : (
              <span className="empty-pick">
                {index === state.cursor ? (
                  <>
                    <span className="dot" /> On the clock
                  </>
                ) : (
                  "—"
                )}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}
