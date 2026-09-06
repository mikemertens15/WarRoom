"use client";
import { useMemo, useState } from "react";
import { MAX_KEEPERS, ROUNDS } from "@/lib/config";
import { keeperAssignments } from "@/lib/draft";
import type { Keeper, League, Player } from "@/lib/types";

/** Pre-draft reservation editor. Round costs stay with stable team IDs when the
 * randomized order changes. Validation rejects collisions without dropping rows.
 */
export default function KeeperEditor({
  league,
  players,
  keepers,
  onChange,
  locked,
}: {
  league: League;
  players: Player[];
  keepers: Keeper[];
  onChange: (keepers: Keeper[]) => void;
  locked: boolean;
}) {
  const [team, setTeam] = useState(league.myTeam);
  const [query, setQuery] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [round, setRound] = useState(1);
  const [error, setError] = useState("");
  const candidates = useMemo(
    () =>
      players
        .filter(
          (p) =>
            !keepers.some((k) => k.playerId === p.id) &&
            p.name
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "")
              .includes(query.toLowerCase().replace(/[^a-z0-9]/g, "")),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [players, keepers, query],
  );
  return (
    <section className="keeper-editor" aria-label="Keeper assignments">
      <h3>
        <span className="step-number">03</span> Keepers{" "}
        <span className="count-badge">{keepers.length}</span>
      </h3>
      <p className="help-text">
        Optional: up to {MAX_KEEPERS} per team. Enter last year's round. Each
        keeper uses that team's pick in the same round under this year's order.
        Change the order above and the reserved picks move automatically.
      </p>
      {locked && (
        <p className="locked-note">
          Keeper assignments are locked after live picks. Undo live picks to
          revise preparation.
        </p>
      )}
      {keepers.length ? (
        <ul className="keeper-list">
          {keepers.map((k) => {
            const index = league.order.indexOf(k.team);
            const overall =
              (k.round - 1) * league.order.length +
              (k.round % 2 ? index + 1 : league.order.length - index);
            return (
              <li key={k.playerId}>
                <div>
                  <strong>
                    {players.find((p) => p.id === k.playerId)?.name ??
                      "Player missing from this dataset"}
                  </strong>
                  <span>
                    {league.teams[k.team]} · Round {k.round} · Pick #{overall}
                  </span>
                </div>
                <button
                  type="button"
                  className="quiet"
                  disabled={locked}
                  aria-label={`Remove keeper ${players.find((p) => p.id === k.playerId)?.name ?? k.playerId}`}
                  onClick={() => {
                    onChange(keepers.filter((row) => row !== k));
                    setError("");
                  }}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="help-text">
          No keepers assigned. Every team may keep zero, one or two players.
        </p>
      )}
      {!locked && (
        <>
          <div className="keeper-fields">
            <label className="field">
              Team
              <select
                aria-label="Keeper team"
                value={team}
                onChange={(e) => setTeam(Number(e.target.value))}
              >
                {league.order.map((id) => (
                  <option key={id} value={id}>
                    {league.teams[id]} (
                    {keepers.filter((k) => k.team === id).length}/2)
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Search player
              <input
                aria-label="Find keeper player"
                value={query}
                placeholder="Type a name…"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPlayerId("");
                }}
              />
            </label>
            <label className="field">
              Player
              <select
                aria-label="Keeper player"
                value={playerId}
                onChange={(e) => setPlayerId(e.target.value)}
              >
                <option value="">Choose player ({candidates.length})</option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.position} · {p.team}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Last year's round
              <select
                aria-label="Keeper round"
                value={round}
                onChange={(e) => setRound(Number(e.target.value))}
              >
                {Array.from({ length: ROUNDS }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              try {
                const next = [...keepers, { team, playerId, round }];
                keeperAssignments(league, players, next);
                onChange(next);
                setPlayerId("");
                setQuery("");
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Add keeper
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <p className="help-text">
        Save preparation to keep these choices without starting. Keeper players
        count on rosters immediately and are unavailable to everyone else.
      </p>
    </section>
  );
}
