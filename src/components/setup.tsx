"use client";
import { useRef, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  ArrowRight,
  FileJson,
  Settings2,
  Upload,
} from "lucide-react";
import { DEFAULT_SCORING } from "@/lib/config";
import { validateLeague } from "@/lib/draft";
import { datasetWarnings, importPlayers } from "@/lib/ingest";
import { samplePlayers } from "@/lib/sample";
import { CURRENT_DATA, currentPlayers } from "@/lib/current-data";
import {
  POSITIONS,
  type DraftState,
  type League,
  type Player,
} from "@/lib/types";
import { Modal, download } from "./ui";

export default function Setup({
  state,
  onClose,
  onSave,
  onReset,
  onRestore,
  onUseLatest,
}: {
  state: DraftState;
  onClose: () => void;
  onSave: (league: League, players: Player[]) => void;
  onReset: () => void;
  onRestore: () => void;
  onUseLatest: (league: League) => void;
}) {
  // Ordinary settings/imports stay a preview until submit. The controlled latest-
  // data path remaps existing picks/history in the parent before persisting.
  const [league, setLeague] = useState<League>(structuredClone(state.league));
  const [players, setPlayers] = useState(state.players);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const warnings = datasetWarnings(players);
  const locked = state.picks.some(Boolean);
  function move(index: number, direction: number) {
    const order = [...league.order];
    [order[index], order[index + direction]] = [
      order[index + direction],
      order[index],
    ];
    setLeague({ ...league, order });
  }
  async function upload(f?: File) {
    if (!f) return;
    try {
      if (f.size > 10000000)
        throw new Error("Dataset exceeds the 10 MB limit.");
      const imported = importPlayers(await f.text(), f.name);
      setPlayers(imported);
      setLeague({ ...league, datasetLabel: f.name });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title="Set the room. Own the draft."
      subtitle="Six teams, your draft order, your player data. Everything stays in this browser."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            validateLeague(league);
            if (players.length < 108)
              throw new Error(
                "Import at least 108 players before starting a full draft.",
              );
            for (const pos of POSITIONS) {
              if (
                players.filter((p) => p.position === pos).length <
                (pos === "RB" || pos === "WR" ? 12 : 6)
              )
                throw new Error(
                  `Not enough ${pos} players for six complete starting rosters.`,
                );
            }
            if (
              players.filter((p) => p.position === "RB" || p.position === "WR")
                .length < 36
            )
              throw new Error(
                "At least 36 RB/WR players are required for starters and FLEX.",
              );
            onSave(league, players);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="setup-grid">
          <section>
            <h3>
              <span className="step-number">01</span> Teams & draft order
            </h3>
            <p className="help-text">
              Top to bottom = picks 1–6. Use arrows after the live random draw.
              Reverse automatically in round 2.
            </p>
            {locked && (
              <p className="locked-note">
                Order and player pool lock after the first pick. Start a new
                draft to change them.
              </p>
            )}
            <div className="team-editor">
              {league.order.map((team, index) => (
                <div key={team}>
                  <span className="order-number">{index + 1}</span>
                  <input
                    aria-label={`Team at draft position ${index + 1}`}
                    maxLength={40}
                    required
                    value={league.teams[team]}
                    onChange={(e) =>
                      setLeague({
                        ...league,
                        teams: league.teams.map((n, i) =>
                          i === team ? e.target.value : n,
                        ),
                      })
                    }
                  />
                  <label
                    className={`mine-toggle ${league.myTeam === team ? "is-mine" : ""}`}
                  >
                    <input
                      type="radio"
                      name="my-team"
                      aria-label={`This is my team: ${league.teams[team]}`}
                      checked={league.myTeam === team}
                      onChange={() => setLeague({ ...league, myTeam: team })}
                    />{" "}
                    Mine
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${league.teams[team]} up`}
                    disabled={locked || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${league.teams[team]} down`}
                    disabled={locked || index === 5}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="settings-summary">
              <strong>18 rounds · 108 picks</strong>
              <span>QB · 2 RB · 2 WR · 2 FLEX (RB/WR) · TE · DST · K</span>
              <span>8 bench spots · 1 IR (not drafted)</span>
            </div>
          </section>
          <section>
            <h3>
              <span className="step-number">02</span> Player dataset
            </h3>
            <div className="dataset-card">
              <FileJson size={27} />
              <strong>{league.datasetLabel}</strong>
              <span>
                {players.length} players ·{" "}
                {players.some((p) => p.sample)
                  ? "Demonstration data"
                  : "Imported data"}
              </span>
              <button
                type="button"
                disabled={locked}
                onClick={() => file.current?.click()}
              >
                <Upload size={15} /> Import CSV or JSON
              </button>
              <input
                ref={file}
                hidden
                type="file"
                accept=".csv,.json"
                aria-label="Import player dataset"
                onChange={(e) => {
                  void upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            <ul className="data-warnings">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <div className="template-actions">
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  if (locked || state.history.length) {
                    onUseLatest(league);
                    return;
                  }
                  setPlayers(currentPlayers());
                  setLeague({ ...league, datasetLabel: CURRENT_DATA.label });
                  setError("");
                }}
              >
                Load latest 2026 data
              </button>
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  download(
                    "players-2026.json",
                    JSON.stringify(
                      { metadata: CURRENT_DATA, players: currentPlayers() },
                      null,
                      2,
                    ),
                  )
                }
              >
                Download 2026 snapshot
              </button>
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  download(
                    "sample-players.json",
                    JSON.stringify(samplePlayers(), null, 2),
                  )
                }
              >
                Download sample JSON
              </button>
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  download(
                    "players-template.csv",
                    "id,name,team,position,projection,adp,consensusRank,positionalRank,tier,bye,status,upside,risk,source,season,sample\r\nexample-wr,Example Player,DEMO,WR,250,12,10,5,2,8,,0.5,0.2,DEMO ONLY,2026,true\r\n",
                    "text/csv",
                  )
                }
              >
                CSV template
              </button>
            </div>
            <p className="help-text">
              Bundled snapshot: {CURRENT_DATA.playerCount} players · fetched{" "}
              {new Date(CURRENT_DATA.fetchedAt).toLocaleString()}. ESPN
              full-season projections, ADP, teams/byes and status; FantasyPros
              PPR consensus ranks. Kicker scoring uses projected made FG yards.{" "}
              <a
                href={CURRENT_DATA.sources.consensus}
                target="_blank"
                rel="noreferrer"
              >
                Consensus source
              </a>
              . Update keeps saved picks and undo history when player identities
              match.
            </p>
            <p className="help-text">
              Required columns: id, name, team, position, projection. Optional
              ADP, tier, bye, risk, upside, source and stats. See README for
              scoring and data-provider mapping.
            </p>
          </section>
        </div>
        <details className="scoring-settings">
          <summary>
            <Settings2 size={16} /> League scoring{" "}
            <span>
              {league.scoring.receptions} PPR · {league.scoring.passTD} passing
              TD · fractional FG
            </span>
          </summary>
          <p className="help-text">
            Points per stat unit. FG yards uses total yards of made field goals
            (38 yards × 0.1 = 3.8). Imported aggregate projections must already
            match these settings. DST scoring comes from the supplied projection
            or dstPoints statistic.
          </p>
          <div className="scoring-grid">
            {Object.keys(DEFAULT_SCORING).map((k) => (
              <label className="field" key={k}>
                {
                  (
                    {
                      receptions: "Reception",
                      passTD: "Passing TD",
                      rushTD: "Rushing TD",
                      recTD: "Receiving TD",
                      passYards: "Passing yard",
                      rushYards: "Rushing yard",
                      recYards: "Receiving yard",
                      interceptions: "Interception",
                      fumblesLost: "Fumble lost",
                      fgYards: "Made FG yard",
                      extraPoints: "Extra point",
                    } as Record<string, string>
                  )[k]
                }
                <input
                  type="number"
                  step="any"
                  min="-100"
                  max="100"
                  required
                  value={league.scoring[k as keyof League["scoring"]]}
                  onChange={(e) =>
                    setLeague({
                      ...league,
                      scoring: {
                        ...league.scoring,
                        [k]:
                          e.target.value === "" ? "" : Number(e.target.value),
                      } as League["scoring"],
                    })
                  }
                />
              </label>
            ))}
          </div>
        </details>
        <div className="modal-footer">
          <div>
            <button type="button" className="quiet danger" onClick={onReset}>
              New / reset draft
            </button>
            <button type="button" className="quiet" onClick={onRestore}>
              Restore backup
            </button>
          </div>
          <button type="submit" className="primary">
            {state.started ? "Save settings" : "Start draft"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
