import { keeperAssignments, rosterFor, rosterSlots, snakeOrder } from "./draft";
import type { DraftState } from "./types";
import { projectedPoints } from "./engine";
/** Human-readable derived lineups for copying/printing, not a restorable backup. */
export function rosterText(state: DraftState, onlyMine = false): string {
  return [
    "DRAFT WAR ROOM · OFFLINE DRAFT",
    state.league.datasetLabel,
    `${state.picks.filter(Boolean).length}/108 slots filled (${state.keepers.length} keepers)`,
    "",
    ...state.league.order
      .filter((team) => !onlyMine || team === state.league.myTeam)
      .map(
        (team) =>
          `${state.league.teams[team]}${team === state.league.myTeam ? " (MY TEAM)" : ""}\n${rosterSlots(
            rosterFor(state, team),
            (p) => projectedPoints(p, state.league.scoring),
          )
            .filter((s) => s.player)
            .map(
              (s) =>
                `${s.slot.padEnd(5)} ${s.player!.name} · ${s.player!.position} · ${s.player!.team}${state.keepers.some((k) => k.playerId === s.player!.id) ? ` [KEEPER · R${state.keepers.find((k) => k.playerId === s.player!.id)!.round}]` : ""}`,
            )
            .join("\n")}\n`,
      ),
  ].join("\n");
}
export function csvCell(value: unknown): string {
  let s = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s; // Prevent spreadsheet formula execution.
  return `"${s.replaceAll('"', '""')}"`;
}
/** Export filled slots with league-scored points and spreadsheet-safe cells.
 * JSON backups, unlike this viewing format, also contain settings and undo history.
 */
export function draftCSV(state: DraftState): string {
  const order = snakeOrder(state.league.order);
  const reserved = keeperAssignments(
    state.league,
    state.players,
    state.keepers,
  );
  const players = new Map(state.players.map((p) => [p.id, p]));
  const rows: unknown[][] = [
    [
      "overall",
      "round",
      "fantasyTeam",
      "playerId",
      "name",
      "position",
      "nflTeam",
      "projection",
      "keeper",
    ],
  ];
  state.picks.forEach((id, i) => {
    const p = id ? players.get(id) : undefined;
    if (p)
      rows.push([
        i + 1,
        order[i].round,
        state.league.teams[order[i].team],
        p.id,
        p.name,
        p.position,
        p.team,
        projectedPoints(p, state.league.scoring),
        reserved.has(i),
      ]);
  });
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
