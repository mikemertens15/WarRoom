"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Download,
  FileJson,
  Grid2X2,
  Keyboard,
  LayoutDashboard,
  ListFilter,
  Radio,
  RotateCcw,
  Search,
  Settings2,
  Shield,
  SlidersHorizontal,
  Target,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { MODEL } from "@/lib/config";
import {
  counts,
  configureDraft,
  needs,
  newDraft,
  nextPick,
  recordPick,
  rosterFor,
  rosterSlots,
  snakeOrder,
  undoPick,
  validateLeague,
} from "@/lib/draft";
import { explanation, projectedPoints, recommend } from "@/lib/engine";
import { draftCSV, rosterText } from "@/lib/export";
import { applyCurrentData, newCurrentDraft } from "@/lib/current-data";

import {
  decodeState,
  loadState,
  saveState,
  STORAGE_KEY,
} from "@/lib/persistence";

import {
  POSITIONS,
  type DraftState,
  type League,
  type Player,
  type Position,
  type Recommendation,
} from "@/lib/types";

import { Modal, PositionBadge, fmt, pct, download } from "./ui";
import Setup from "./setup";
import DraftBoard from "./draft-board";
import EditPick from "./edit-pick";
import ReleaseInfo from "./release-info";
import PickPlanner, { OpponentLearning } from "./pick-planner";

type View = "room" | "board" | "model";

export default function WarRoom() {
  // Persisted draft state lives here; search, dialogs and navigation are ephemeral.
  // Keep the ref aligned with successful writes so rapid pick events see fresh data.
  const [state, setState] = useState<DraftState | null>(null);
  const live = useRef<DraftState | null>(null);
  const savedRaw = useRef<string | null>(null);
  const upgradedDemo = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("room");
  const [setup, setSetup] = useState(false);
  const [why, setWhy] = useState<Recommendation | null>(null);
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [jumping, setJumping] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState<Position | "ALL" | "FLEX">("ALL");
  const [listQuery, setListQuery] = useState("");
  const [sort, setSort] = useState("score");
  const input = useRef<HTMLInputElement>(null);
  const restore = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const loaded = loadState(localStorage);
      savedRaw.current = localStorage.getItem(STORAGE_KEY);
      let s = loaded.state ?? newCurrentDraft();
      // Only migrate an untouched demo setup automatically; never an active draft,
      // custom import, or recovery from a damaged save.
      const upgradeDemo =
        loaded.state &&
        !loaded.recovered &&
        !s.picks.some(Boolean) &&
        !s.history.length &&
        s.players.every((p) => p.sample);
      if (upgradeDemo) {
        s = {
          ...applyCurrentData(s),
          updatedAt: new Date().toISOString(),
          revision: crypto.randomUUID(),
        };
        saveState(localStorage, s);
        savedRaw.current = localStorage.getItem(STORAGE_KEY);
        upgradedDemo.current = true;
      }
      live.current = s;
      setState(s);
      if (loaded.state)
        setNotice(
          upgradedDemo.current
            ? "Current 2026 data installed. Your team names, draft order and scoring were preserved."
            : loaded.recovered
              ? "Recovered the previous valid save. Check the last pick before continuing."
              : `Draft restored · ${s.picks.filter(Boolean).length} slots filled, including ${s.keepers.length} keepers. You’re ready to continue.`,
        );
    } catch (e) {
      setError((e as Error).message);
    }
    const changed = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY)
        setError(
          "Draft changed in another tab. Reload this tab before recording picks to avoid overwriting it.",
        );
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  function commit(next: DraftState, message?: string) {
    // Compare raw storage as well as listening for events: another tab may have
    // written before this tab processes its storage event. Failure is never success.
    try {
      if (localStorage.getItem(STORAGE_KEY) !== savedRaw.current)
        throw new Error(
          "Draft changed in another tab. Reload before continuing.",
        );
      const updated = {
        ...next,
        updatedAt: new Date().toISOString(),
        revision: crypto.randomUUID(),
      };
      saveState(localStorage, updated);
      savedRaw.current = localStorage.getItem(STORAGE_KEY);
      live.current = updated;
      setState(updated);
      setError("");
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError(
        `Change was not recorded: ${(e as Error).message} Export a backup before troubleshooting browser storage.`,
      );
      return false;
    }
  }
  function pick(id: string, index?: number) {
    const s = live.current;
    if (!s) return;
    try {
      const next = recordPick(s, id, index);
      if (index !== undefined && index !== s.cursor) next.cursor = s.cursor;
      const slot = snakeOrder(s.league.order)[index ?? s.cursor];
      if (
        commit(
          next,
          `${s.players.find((p) => p.id === id)?.name} → ${s.league.teams[slot.team]} · Pick ${slot.overall} saved`,
        )
      ) {
        setQuery("");
        setSelected(0);
        setEditing(null);
        input.current?.focus();
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function undo() {
    const s = live.current;
    if (s?.history.length)
      commit(
        undoPick(s),
        "Last pick action undone. Previous draft state restored.",
      );
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement).tagName,
      );
      if (
        (!typing && e.key === "/") ||
        ((e.ctrlKey || e.metaKey) && e.key === "k")
      ) {
        e.preventDefault();
        input.current?.focus();
      }
      if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        const s = live.current;
        if (s?.history.length) commit(undoPick(s), "Last pick action undone.");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const model = useMemo(() => (state ? recommend(state) : null), [state]);
  const order = useMemo(
    () => (state ? snakeOrder(state.league.order) : []),
    [state],
  );
  const roster = useMemo(
    () => (state ? rosterFor(state, state.league.myTeam) : []),
    [state],
  );
  const searchResults = useMemo(() => {
    const q = query.toLowerCase().replace(/[^a-z0-9]/g, "");
    return q
      ? (model?.ranked
          .filter((p) =>
            `${p.name}${p.team}`
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "")
              .includes(q),
          )
          .slice(0, 8) ?? [])
      : [];
  }, [model, query]);
  const table = useMemo(
    () =>
      model?.ranked
        .filter(
          (p) =>
            (filter === "ALL" ||
              (filter === "FLEX" && ["RB", "WR"].includes(p.position)) ||
              p.position === filter) &&
            `${p.name} ${p.team}`
              .toLowerCase()
              .includes(listQuery.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "rank"
            ? a.modelRank - b.modelRank
            : sort === "projection"
              ? b.points - a.points
              : sort === "adp"
                ? (a.adp ?? Infinity) - (b.adp ?? Infinity)
                : Number(b.eligible) - Number(a.eligible) || b.score - a.score,
        ) ?? [],
    [model, filter, listQuery, sort],
  );
  async function restoreFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 15000000)
        throw new Error("Backup is too large (15 MB maximum).");
      const imported = decodeState(await file.text());
      if (
        !confirm(
          `Replace the current draft with this backup? ${imported.picks.filter(Boolean).length} picks recorded; saved ${imported.updatedAt}.`,
        )
      )
        return;
      savedRaw.current = localStorage.getItem(STORAGE_KEY);
      commit(imported, "Draft backup restored.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const restoreInput = (
    <input
      hidden
      type="file"
      accept=".json"
      ref={restore}
      aria-label="Restore draft backup"
      onChange={(e) => {
        void restoreFile(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  if (!state || !model)
    return (
      <main className="recovery">
        <div className="brand-icon">
          <Target />
        </div>
        <h1>Draft War Room</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              className="primary"
              onClick={() => restore.current?.click()}
            >
              Import draft backup
            </button>
            <button
              onClick={() => {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) download("damaged-draft-save.txt", raw, "text/plain");
              }}
            >
              Download saved data
            </button>
            <button
              onClick={() => {
                if (
                  confirm(
                    "Discard the damaged save and create a new draft? Download the saved data first if you need it.",
                  )
                ) {
                  savedRaw.current = localStorage.getItem(STORAGE_KEY);
                  commit(newCurrentDraft(), "New draft created.");
                }
              }}
            >
              Reset saved draft
            </button>
            {restoreInput}
          </>
        ) : (
          <p>Loading your draft…</p>
        )}
      </main>
    );
  const current = order[state.cursor];
  const mineNow = current?.team === state.league.myTeam;
  const nextMine = mineNow
    ? state.cursor
    : nextPick(order, state.cursor, state.league.myTeam, false, state.picks);
  const completed = state.picks.filter(Boolean).length;
  const top = model.ranked.find((p) => p.eligible);
  const rosterNeeds = needs(roster);
  const posCounts = counts(roster);
  const slots = rosterSlots(roster, (p) =>
    projectedPoints(p, state.league.scoring),
  );
  const sample = state.players.some((p) => p.sample);
  const earlierGaps = state.picks
    .slice(0, state.cursor)
    .filter((p) => p === null).length;
  return (
    <div className="app-shell">
      <aside className="rail">
        <a href="#main" className="brand-icon" aria-label="Draft War Room home">
          <Target size={24} />
        </a>
        <div className="rail-nav">
          <button
            title="War room"
            aria-label="War room"
            className={view === "room" ? "active" : ""}
            onClick={() => setView("room")}
          >
            <LayoutDashboard />
          </button>
          <button
            title="Draft board"
            aria-label="Draft board"
            className={view === "board" ? "active" : ""}
            onClick={() => setView("board")}
          >
            <Grid2X2 />
          </button>
          <button
            title="Model lab"
            aria-label="Model lab"
            className={view === "model" ? "active" : ""}
            onClick={() => setView("model")}
          >
            <SlidersHorizontal />
          </button>
        </div>
        <button
          className="rail-bottom"
          title="League setup"
          aria-label="League setup"
          onClick={() => setSetup(true)}
        >
          <Settings2 />
        </button>
        <div className="avatar">GM</div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="wordmark">
            <span>
              DRAFT <strong>WAR ROOM</strong>
            </span>
            <span className="year">2026</span>
            <ReleaseInfo />
          </div>
          <div className="header-meta">
            <span className="local-status">
              <span className="dot" />
              {state.revision === "initial" ? "LOCAL FIRST" : "SAVED LOCALLY"}
            </span>
            <span className="header-divider" />
            <button className="quiet" onClick={() => setSetup(true)}>
              <Settings2 size={15} /> League setup
            </button>
            <button
              className="export-button"
              onClick={() => setExporting(true)}
            >
              <Download size={15} /> Export draft
            </button>
          </div>
        </header>
        <main id="main">
          <nav className="mobile-nav" aria-label="Draft views">
            <button
              className={view === "room" ? "active" : ""}
              onClick={() => setView("room")}
            >
              War room
            </button>
            <button
              className={view === "board" ? "active" : ""}
              onClick={() => setView("board")}
            >
              Draft board
            </button>
            <button
              className={view === "model" ? "active" : ""}
              onClick={() => setView("model")}
            >
              Model lab
            </button>
          </nav>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="orange-dot" /> OFFLINE DRAFT COMMAND CENTER
              </div>
              <h1>
                {view === "room"
                  ? "Your next pick. Your edge."
                  : view === "board"
                    ? "Every pick. The full picture."
                    : "Know what’s behind the pick."}
              </h1>
              <p>
                6 teams <span>·</span> Full PPR
                {state.league.scoring.receptions !== 1
                  ? ` → ${state.league.scoring.receptions} PPR`
                  : ""}{" "}
                <span>·</span> 2 RB / 2 WR / 2 FLEX <span>·</span> Snake draft
              </p>
            </div>
            <div className="live-pill">
              <Radio size={14} />
              {!state.started
                ? "PRE-DRAFT"
                : completed === 108
                  ? "DRAFT COMPLETE"
                  : "DRAFT LIVE"}
            </div>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <span>{error}</span>
              <button onClick={() => location.reload()}>Reload</button>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <Check size={14} />
              <span>{notice}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {sample && (
            <div className="sample-banner">
              <span>
                <span className="sample-tag">DEMO DATA</span>Practice pool with
                fictional projections and ADP. Import verified 2026 data before
                draft night.
              </span>
              <button onClick={() => setSetup(true)}>
                Manage data <ArrowRight size={13} />
              </button>
            </div>
          )}
          {!state.started && (
            <div className="preflight">
              <div>
                <strong>Make this your draft.</strong>
                <span>
                  {" "}
                  Enter the randomized order, choose your team, and check your
                  player data.
                </span>
              </div>
              <button className="primary" onClick={() => setSetup(true)}>
                Set up draft <ArrowRight size={16} />
              </button>
            </div>
          )}
          {earlierGaps > 0 && (
            <div className="alert error">
              {earlierGaps} earlier picks are empty. Forecasts from the current
              cursor exclude those missing picks.
              <button
                onClick={() =>
                  commit(
                    { ...state, cursor: state.picks.indexOf(null) },
                    "Returned to the first unfilled pick.",
                  )
                }
              >
                Return to first empty pick
              </button>
            </div>
          )}
          <section className="clock-strip" aria-label="Draft status">
            <div
              className={`clock-main ${mineNow && state.started ? "my-clock" : ""}`}
            >
              <div className="clock-symbol">
                <Radio size={21} />
              </div>
              <div>
                <span className="eyebrow">
                  {current ? "ON THE CLOCK" : "ALL PICKS RECORDED"}
                </span>
                <h2>
                  {current
                    ? state.league.teams[current.team]
                    : "Draft complete"}
                  {mineNow && <span className="you-tag">YOU</span>}
                </h2>
              </div>
            </div>
            <div className="clock-stat">
              <span>ROUND / PICK</span>
              <strong>
                {current ? (
                  <>
                    {String(current.round).padStart(2, "0")}
                    <small>
                      {" "}
                      / {String((state.cursor % 6) + 1).padStart(2, "0")}
                    </small>
                  </>
                ) : (
                  "18 / 06"
                )}
              </strong>
            </div>
            <div className="clock-stat">
              <span>OVERALL</span>
              <strong>
                {current ? `#${current.overall}` : "108"}
                <small> / 108</small>
              </strong>
            </div>
            <div className="clock-stat next-stat">
              <span>YOUR NEXT PICK</span>
              <strong>
                {nextMine === null
                  ? "Finished"
                  : nextMine === state.cursor
                    ? "You’re up"
                    : `#${nextMine + 1}`}
                <small>
                  {nextMine !== null && nextMine > state.cursor
                    ? `${order.slice(state.cursor, nextMine).filter((p) => state.picks[p.overall - 1] === null).length} selections away`
                    : mineNow
                      ? "Make it count"
                      : "Roster ready"}
                </small>
              </strong>
            </div>
            <div className="progress-box">
              <span>{completed} of 108 filled</span>
              <small>
                {state.keepers.length} keepers ·{" "}
                {completed - state.keepers.length} live picks
              </small>
              <div className="track">
                <i style={{ width: `${(completed / 108) * 100}%` }} />
              </div>
            </div>
          </section>
          <section className="pick-command" aria-label="Record draft pick">
            <div className="command-search">
              <Search size={20} />
              <input
                ref={input}
                aria-label="Search player to draft"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={!!query}
                aria-controls="player-results"
                aria-activedescendant={
                  searchResults[selected]
                    ? `result-${searchResults[selected].id}`
                    : undefined
                }
                placeholder={
                  completed === 108
                    ? "Draft complete — use the board to correct a pick"
                    : "Record a pick — search any available player…"
                }
                value={query}
                disabled={!state.started || completed === 108}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelected((i) =>
                      Math.min(i + 1, searchResults.length - 1),
                    );
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelected((i) => Math.max(i - 1, 0));
                  }
                  if (e.key === "Escape") setQuery("");
                  if (e.key === "Enter" && searchResults[selected]) {
                    e.preventDefault();
                    pick(searchResults[selected].id);
                  }
                }}
              />
              <kbd>/</kbd>
              {query && (
                <div
                  className="search-results"
                  id="player-results"
                  role="listbox"
                >
                  {searchResults.length ? (
                    searchResults.map((p, i) => (
                      <button
                        id={`result-${p.id}`}
                        role="option"
                        aria-selected={i === selected}
                        className={i === selected ? "selected" : ""}
                        key={p.id}
                        onMouseEnter={() => setSelected(i)}
                        onClick={() => pick(p.id)}
                      >
                        <PositionBadge pos={p.position} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.team} · Model #{p.modelRank}
                          </small>
                        </span>
                        <span className="result-action">
                          Draft to{" "}
                          {current ? state.league.teams[current.team] : "team"}{" "}
                          <ArrowRight size={14} />
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="no-results">
                      No available players match “{query}”. Check the dataset or
                      earlier picks.
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              className="command-action"
              disabled={!state.history.length}
              onClick={undo}
            >
              <RotateCcw size={16} />
              Undo<span className="shortcut">Ctrl Z</span>
            </button>
            <button
              className="command-action"
              disabled={!state.started}
              onClick={() => setJumping(true)}
            >
              Go to pick <ChevronRight size={16} />
            </button>
          </section>
          {view === "room" && (
            <div className="war-grid">
              <section className="panel roster-panel">
                <div className="panel-heading">
                  <h2>
                    <Shield size={16} /> My team
                  </h2>
                  <span className="muted">{roster.length}/18</span>
                </div>
                <div className="roster-title">
                  <div className="team-mark">
                    {state.league.teams[state.league.myTeam]
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div>
                    <strong>{state.league.teams[state.league.myTeam]}</strong>
                    <span>
                      Draft position{" "}
                      {state.league.order.indexOf(state.league.myTeam) + 1}{" "}
                      <span className="you-tag">YOU</span>
                    </span>
                  </div>
                </div>
                <div className="roster-counts">
                  {POSITIONS.map((pos) => (
                    <div key={pos}>
                      <span className={`text-${pos.toLowerCase()}`}>{pos}</span>
                      <strong>{posCounts[pos]}</strong>
                    </div>
                  ))}
                </div>
                <div className="section-label">
                  STARTING LINEUP <span>PROJ.</span>
                </div>
                <div className="roster-slots">
                  {slots.slice(0, 10).map((s, i) => (
                    <div className="roster-slot" key={i}>
                      <PositionBadge pos={s.slot} />
                      <div>
                        {s.player ? (
                          <>
                            <strong>{s.player.name}</strong>
                            <small>
                              {s.player.team} · {s.player.position}
                            </small>
                          </>
                        ) : (
                          <span className="empty-slot">Open spot</span>
                        )}
                      </div>
                      <span className="roster-points">
                        {s.player
                          ? fmt(projectedPoints(s.player, state.league.scoring))
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <details className="bench" open={roster.length > 10}>
                  <summary>
                    BENCH{" "}
                    <span>
                      {slots.slice(10).filter((s) => s.player).length} / 8
                    </span>
                  </summary>
                  {slots.slice(10).map((s, i) => (
                    <div className="roster-slot" key={i}>
                      <span className="bench-number">{i + 1}</span>
                      <div>
                        {s.player ? (
                          <>
                            <strong>{s.player.name}</strong>
                            <small>
                              {s.player.position} · {s.player.team}
                            </small>
                          </>
                        ) : (
                          <span className="empty-slot">Open spot</span>
                        )}
                      </div>
                    </div>
                  ))}
                </details>
                <div className="roster-foot">
                  <span>
                    IR <strong>1 reserved spot</strong>
                  </span>
                  <p>
                    Lineup placement is provisional. FLEX and bench rebalance as
                    you draft.
                  </p>
                </div>
                <div className="needs">
                  <span className="eyebrow">ROSTER NEEDS</span>
                  <p>
                    {rosterNeeds.length
                      ? [...new Set(rosterNeeds)]
                          .map(
                            (pos) =>
                              `${rosterNeeds.filter((p) => p === pos).length} ${pos}`,
                          )
                          .join(" · ")
                      : "All starting positions covered."}
                  </p>
                </div>
              </section>
              <div className="center-column">
                {top && (
                  <section className="recommendation">
                    <div className="rec-top">
                      <span>
                        <Zap size={15} fill="currentColor" />{" "}
                        {mineNow
                          ? "YOUR TOP RECOMMENDATION"
                          : "TOP TARGET FOR YOUR ROSTER"}
                      </span>
                      <button onClick={() => setWhy(top)}>
                        Why this pick? <CircleHelp size={14} />
                      </button>
                    </div>
                    <div className="rec-body">
                      <div
                        className={`player-monogram pos-${top.position.toLowerCase()}`}
                      >
                        {top.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <div className="rec-name">
                        <h2>{top.name}</h2>
                        <div>
                          <PositionBadge pos={top.position} />
                          <span>{top.team}</span>
                          <span>·</span>
                          <span>
                            {top.position}
                            {top.posRank}
                          </span>
                          <span>·</span>
                          <span>Tier {top.modelTier}</span>
                        </div>
                      </div>
                      <div className="rec-score">
                        <strong>{fmt(top.score)}</strong>
                        <span>REC. SCORE</span>
                      </div>
                    </div>
                    <p className="rec-reason">
                      +{fmt(top.rosterGain)} projected roster value.{" "}
                      {top.peers === 0 ? "Last player in his tier. " : ""}
                      {model.window.target === null
                        ? "No later turn remains. Fill your final roster needs."
                        : model.window.selections === 0
                          ? "Back-to-back picks. Take the best fit; no opponent can pick between your turns."
                          : `${model.window.selections} selections until your next turn. ${top.alternative ? `${top.alternative} is a likely ${top.position} alternative if you wait.` : `No likely ${top.position} alternative clears the forecast threshold.`}`}
                    </p>
                    <div className="rec-bottom">
                      <span>
                        <span className="dot" />
                        {model.window.target === null
                          ? "Final-turn decision"
                          : `${pct(top.survival)} estimated chance to return`}
                      </span>
                      <button
                        className="primary"
                        disabled={!state.started || !current}
                        onClick={() => pick(top.id)}
                      >
                        {mineNow
                          ? "Draft player"
                          : `Record for ${current ? state.league.teams[current.team] : "team"}`}
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  </section>
                )}
                <PickPlanner state={state} model={model} />
                <section className="panel available-panel">
                  <div className="panel-heading">
                    <h2>
                      Best available{" "}
                      <span className="count-badge">{model.ranked.length}</span>
                    </h2>
                    <span className="league-model">
                      <Activity size={13} /> League-adjusted model
                    </span>
                  </div>
                  <div className="table-controls">
                    <div className="position-tabs">
                      {["ALL", "QB", "RB", "WR", "TE", "FLEX", "DST", "K"].map(
                        (pos) => (
                          <button
                            key={pos}
                            className={filter === pos ? "active" : ""}
                            onClick={() => setFilter(pos as typeof filter)}
                          >
                            {pos === "ALL" ? "All" : pos}
                          </button>
                        ),
                      )}
                    </div>
                    <div className="table-options">
                      <label className="mini-search">
                        <Search size={14} />
                        <input
                          aria-label="Filter best available"
                          placeholder="Filter players"
                          value={listQuery}
                          onChange={(e) => setListQuery(e.target.value)}
                        />
                      </label>
                      <label className="sort-select">
                        <ListFilter size={14} />
                        <select
                          aria-label="Sort available players"
                          value={sort}
                          onChange={(e) => setSort(e.target.value)}
                        >
                          <option value="score">Recommendation</option>
                          <option value="rank">Model rank</option>
                          <option value="projection">Projection</option>
                          <option value="adp">ADP</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table className="player-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>PLAYER</th>
                          <th>PROJ.</th>
                          <th>TIER</th>
                          <th>VALUE</th>
                          <th>ADP</th>
                          <th>SIGNAL</th>
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.slice(0, 100).map((p) => (
                          <tr
                            key={p.id}
                            className={p.id === top?.id ? "top-row" : ""}
                          >
                            <td className="rank">{p.modelRank}</td>
                            <td>
                              <button
                                className="player-name"
                                onClick={() => setWhy(p)}
                              >
                                {p.name}
                              </button>
                              <div className="player-sub">
                                <PositionBadge pos={p.position} />
                                <span>
                                  {p.team} · {p.position}
                                  {p.posRank}
                                </span>
                                {p.status && (
                                  <span className="injury">{p.status}</span>
                                )}
                              </div>
                            </td>
                            <td className="numeric">{fmt(p.points)}</td>
                            <td>
                              <span className="tier-number">{p.modelTier}</span>
                            </td>
                            <td className="numeric value-text">
                              +{fmt(p.value)}
                            </td>
                            <td className="numeric muted">
                              {p.adp ? fmt(p.adp) : "—"}
                            </td>
                            <td>
                              <button
                                onClick={() => setWhy(p)}
                                className={`signal signal-${p.statusLabel.toLowerCase().replaceAll(" ", "-")}`}
                              >
                                {p.statusLabel === "TAKE" && <Zap size={11} />}
                                {p.statusLabel}
                              </button>
                            </td>
                            <td>
                              <button
                                className="draft-small"
                                aria-label={`Draft ${p.name}`}
                                title={`Record ${p.name} for the team on the clock`}
                                disabled={!state.started || !current}
                                onClick={() => pick(p.id)}
                              >
                                <ArrowRight size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!table.length && (
                      <div className="empty-state">
                        No players match this filter.
                      </div>
                    )}
                  </div>
                  <div className="table-footer">
                    <span>
                      {Math.min(100, table.length)} of {table.length} players ·
                      value = starter VOR + discounted depth
                    </span>
                    <span>
                      <Keyboard size={13} /> / to record a pick
                    </span>
                  </div>
                </section>
              </div>
              <aside className="panel forecast-panel">
                <div className="panel-heading">
                  <h2>
                    <Activity size={16} /> Next-turn forecast
                  </h2>
                  <span className="beta-label">HEURISTIC</span>
                </div>
                <div className="forecast-intro">
                  <span className="eyebrow">
                    {model.window.target === null
                      ? "NO LATER TURN"
                      : `YOUR NEXT TURN · PICK #${model.window.target + 1}`}
                  </span>
                  <div>
                    <strong>{model.window.selections}</strong>
                    <span>
                      selections
                      <br />
                      between your turns
                    </span>
                  </div>
                  <p>
                    {model.window.target === null
                      ? "Prioritize your remaining roster needs."
                      : "Who comes back if you pass? Estimates use market rank and opponent needs."}
                  </p>
                </div>
                <div className="forecast-list">
                  {model.ranked.slice(0, 5).map((p) => (
                    <button
                      className="forecast-player"
                      key={p.id}
                      onClick={() => setWhy(p)}
                    >
                      <div>
                        <strong>{p.name}</strong>
                        <PositionBadge pos={p.position} />
                      </div>
                      <div className="survival-line">
                        <span>
                          {model.window.target === null
                            ? "No next pick"
                            : p.survival < 0.35
                              ? "Likely gone"
                              : p.survival >= 0.7
                                ? "Likely available"
                                : "Could go either way"}
                        </span>
                        <strong className={p.survival < 0.35 ? "low" : "high"}>
                          {model.window.target === null ? "—" : pct(p.survival)}
                        </strong>
                      </div>
                      <div className="probability-track">
                        <i
                          className={p.survival < 0.35 ? "low-bg" : "high-bg"}
                          style={{ width: `${p.survival * 100}%` }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
                <div className="position-outlook">
                  <h3>IF YOU WAIT</h3>
                  {(["RB", "WR", "QB", "TE"] as Position[]).map((pos) => {
                    const p = model.ranked.find((p) => p.position === pos);
                    return (
                      <div key={pos}>
                        <PositionBadge pos={pos} />
                        <span>
                          {p?.alternative ?? "No likely alternative"}
                          <small>
                            {p
                              ? `${p.tierDrop ? `↓ ${p.tierDrop} tier drop` : "No tier drop"} · ${fmt(p.alternativeValue)} expected value`
                              : "Pool exhausted"}
                          </small>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="opponents">
                  <h3>PICKING BEFORE YOUR NEXT TURN</h3>
                  {model.window.between.length ? (
                    [...new Set(model.window.between.map((s) => s.team))].map(
                      (team) => (
                        <div key={team}>
                          <span>{state.league.teams[team]}</span>
                          <small>
                            {
                              model.window.between.filter(
                                (s) => s.team === team,
                              ).length
                            }{" "}
                            pick(s) · Needs{" "}
                            {[...new Set(needs(rosterFor(state, team)))].join(
                              " / ",
                            ) || "bench"}
                          </small>
                        </div>
                      ),
                    )
                  ) : (
                    <p className="muted">
                      {model.window.target === null
                        ? "No later turn."
                        : "Nobody. You have consecutive picks."}
                    </p>
                  )}
                </div>
                <div className="forecast-note">
                  <CircleHelp size={14} />
                  <span>
                    Estimates are directional, not calibrated probabilities.
                    Click a player to inspect the calculation.
                  </span>
                </div>
              </aside>
            </div>
          )}
          {view === "model" && (
            <section className="panel model-panel">
              <div className="panel-heading">
                <h2>
                  <SlidersHorizontal size={18} /> Model lab
                </h2>
                <span className="muted">
                  Season-point units · inspect any player for details
                </span>
              </div>
              <div className="model-explanation">
                <h3>A six-team baseline. A next-turn decision.</h3>
                <OpponentLearning state={state} model={model} />
                <p>
                  First reserve 12 RB and 12 WR starters, then allocate 12 FLEX
                  slots to the highest projected remaining RB/WR players. Use
                  the next player at each position as replacement. QB, TE, DST
                  and K use the seventh player. Replacement baselines stay fixed
                  as the draft progresses.
                </p>
                <div className="baseline-grid">
                  {POSITIONS.map((pos) => (
                    <div key={pos}>
                      <PositionBadge pos={pos} />
                      <strong>{fmt(model.valuation.replacement[pos])}</strong>
                      <small>
                        {pos}
                        {model.valuation.replacementRank[pos]} baseline
                      </small>
                    </div>
                  ))}
                  <div>
                    <PositionBadge pos="FLEX" />
                    <strong>{fmt(model.valuation.flexBaseline)}</strong>
                    <small>Combined RB/WR</small>
                  </div>
                </div>
                <p>
                  Value includes positive starter VOR plus{" "}
                  {MODEL.depthWeight * 100}% of value above the projected bench
                  cutoff (one QB, three RBs, three WRs and one TE per team).
                  Recommendation = marginal roster gain + expected loss from
                  waiting + tier cliff + roster need + upside − risk. The
                  forecast distributes each opponent pick across available
                  players using ADP/model rank, positional demand and bounded
                  learned preferences. Roster gain measures the change in
                  starter value plus bench depth; successive same-position
                  reserves earn
                  {MODEL.benchDecay * 100}% of the preceding reserve’s weight.
                  Aggregate projections are never silently rescored.
                </p>
              </div>
              <div className="table-scroll">
                <table className="player-table debug-table">
                  <thead>
                    <tr>
                      {[
                        "PLAYER",
                        "RAW PROJ",
                        "SCORED",
                        "ADP",
                        "BASELINE",
                        "VOR",
                        "ROSTER GAIN",
                        "TIER +",
                        "URGENCY +",
                        "NEED +",
                        "UPSIDE +",
                        "RISK −",
                        "SURVIVE",
                        "SCORE",
                      ].map((x) => (
                        <th key={x}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {model.ranked.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <button
                            className="player-name"
                            onClick={() => setWhy(p)}
                          >
                            {p.name}
                          </button>
                          <small>
                            {p.position}
                            {p.posRank} · Tier {p.modelTier}
                          </small>
                        </td>
                        {[
                          p.projection,
                          p.points,
                          p.adp,
                          p.baseline,
                          p.vor,
                          p.rosterGain,
                          p.tierAdjustment,
                          p.urgency,
                          p.need,
                          p.upsideBonus,
                          p.riskPenalty,
                        ].map((n, i) => (
                          <td key={i} className="numeric">
                            {n === undefined ? "—" : fmt(n)}
                          </td>
                        ))}
                        <td>{pct(p.survival)}</td>
                        <td className="value-text">{fmt(p.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {view !== "model" && (
            <DraftBoard
              state={state}
              full={view === "board"}
              onEdit={(i) => setEditing(i)}
              onExpand={() => setView("board")}
            />
          )}
          <footer className="page-footer">
            <span>
              <Shield size={13} /> Your draft stays on this device.
            </span>
            <span>
              {state.league.datasetLabel} <span>·</span> No account. No sync.
              All football.
            </span>
          </footer>
        </main>
      </div>
      {setup && (
        <Setup
          state={state}
          onClose={() => setSetup(false)}
          onSave={(league, players, keepers, start) => {
            try {
              if (
                commit(
                  configureDraft(
                    live.current!,
                    league,
                    players,
                    keepers,
                    start,
                  ),
                  !start && !state.started
                    ? "Preparation saved. Keepers and draft order are ready to review."
                    : state.started
                      ? "League settings saved."
                      : "Draft started. Search a player and press Enter to record the first pick.",
                )
              ) {
                setSetup(false);
                setTimeout(() => input.current?.focus(), 0);
              }
            } catch (e) {
              setError((e as Error).message);
              setSetup(false);
            }
          }}
          onReset={() => {
            if (
              confirm(
                "Clear all live picks and undo history? Your keeper reservations and player data will stay. Export a JSON backup first if you want to keep this draft.",
              )
            ) {
              if (
                commit(
                  newDraft(state.league, state.players, state.keepers),
                  "New draft created. Check the order before starting.",
                )
              )
                setSetup(false);
            }
          }}
          onRestore={() => restore.current?.click()}
          onUseLatest={(league) => {
            try {
              validateLeague(league);
              if (
                commit(
                  applyCurrentData({ ...live.current!, league }),
                  "2026 data updated. Existing picks and undo history were preserved; league settings saved.",
                )
              )
                setSetup(false);
            } catch (e) {
              setError((e as Error).message);
              setSetup(false);
            }
          }}
        />
      )}
      {why && (
        <Modal
          title={why.name}
          subtitle={`${why.position}${why.posRank} · ${why.team} · Tier ${why.modelTier}`}
          onClose={() => setWhy(null)}
        >
          <p className="why-copy">
            {explanation(
              why,
              model.window.selections,
              model.window.target !== null,
            )}
          </p>
          <div className="why-grid">
            {[
              ["Raw projection", fmt(why.projection)],
              ["Scored projection", fmt(why.points)],
              ["Raw ADP", why.adp ? fmt(why.adp) : "Not supplied"],
              ["Replacement baseline", fmt(why.baseline)],
              ["Value over replacement", fmt(why.vor)],
              ["FLEX VOR (included)", fmt(why.flexValue)],
              ["Bench baseline", fmt(why.benchBaseline)],
              ["Depth value (included)", fmt(why.depthValue)],
              ["League player value", fmt(why.value)],
              ["Starter improvement", fmt(why.starterGain)],
              ["Bench improvement", fmt(why.benchGain)],
              ["Total roster gain", fmt(why.rosterGain)],
              ["Gain/value ratio (tier & upside)", fmt(why.fit)],
              ["Tier adjustment", `+${fmt(why.tierAdjustment)}`],
              ["Next-turn urgency", `+${fmt(why.urgency)}`],
              ["Positional need", `+${fmt(why.need)}`],
              [
                "Upside / risk",
                `+${fmt(why.upsideBonus)} / −${fmt(why.riskPenalty)}`,
              ],
              ["Recommendation score", fmt(why.score)],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="help-text">
            Source: {why.source ?? "Not supplied"}.{" "}
            {why.sample ? "MOCK DATA. " : ""}
            {why.stats
              ? "Scored from imported statistics."
              : "Aggregate projection used as supplied."}{" "}
            Injury/status: {why.status || "not supplied"}. Bye:{" "}
            {why.bye ?? "unknown"}. Status text is shown for your judgment; only
            an explicit numeric risk field affects the score.
          </p>
          <button
            className="primary"
            disabled={!state.started || !current}
            onClick={() => {
              pick(why.id);
              setWhy(null);
            }}
          >
            Record for {current ? state.league.teams[current.team] : "team"}
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {editing !== null && (
        <EditPick
          state={state}
          index={editing}
          onClose={() => setEditing(null)}
          onPick={(id) => pick(id, editing)}
        />
      )}
      {jumping && (
        <Modal
          title="Go to a pick"
          subtitle="Use this to catch up with the physical board. Existing picks are preserved."
          onClose={() => setJumping(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const index =
                Number(new FormData(e.currentTarget).get("pick")) - 1;
              if (
                Number.isInteger(index) &&
                index >= 0 &&
                index < 108 &&
                commit(
                  { ...state, cursor: index },
                  `Moved to pick #${index + 1}. Check for empty earlier picks.`,
                )
              )
                setJumping(false);
            }}
          >
            <label className="field">
              Overall pick (1–108)
              <input
                name="pick"
                type="number"
                min="1"
                max="108"
                required
                defaultValue={Math.min(state.cursor + 1, 108)}
              />
            </label>
            <p className="help-text">
              Selecting a player at an occupied pick replaces that pick. Use the
              draft board to correct an earlier pick without moving your current
              cursor.
            </p>
            <button className="primary" type="submit">
              Go to pick <ArrowRight size={15} />
            </button>
          </form>
        </Modal>
      )}
      {exporting && (
        <Modal
          title="Take your draft with you"
          subtitle="A complete backup, a spreadsheet, or a roster ready for ESPN entry."
          onClose={() => setExporting(false)}
          wide
        >
          <div className="export-actions">
            <button
              onClick={() =>
                download(
                  "war-room-draft-backup.json",
                  JSON.stringify(state, null, 2),
                )
              }
            >
              <FileJson size={20} />
              <strong>JSON backup</strong>
              <span>Players, settings, picks & undo history</span>
            </button>
            <button
              onClick={() =>
                download(
                  "war-room-draft.csv",
                  draftCSV(state),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download size={20} />
              <strong>Draft CSV</strong>
              <span>Every recorded pick by team</span>
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(rosterText(state, true));
                  setNotice("Your roster copied to clipboard.");
                } catch {
                  setError(
                    "Clipboard unavailable. Select and copy the roster preview below.",
                  );
                }
              }}
            >
              <Clipboard size={20} />
              <strong>Copy my roster</strong>
              <span>A clean summary for manual entry</span>
            </button>
            <button onClick={() => window.print()}>
              <Download size={20} />
              <strong>Print all rosters</strong>
              <span>Print or save as PDF</span>
            </button>
          </div>
          <textarea
            className="roster-preview"
            aria-label="All team rosters"
            readOnly
            value={rosterText(state)}
          />
          <p className="help-text">
            Moving devices? Transfer the JSON backup to the other device and
            restore it at the same website address. Each browser keeps its own
            draft; changes do not sync automatically.
          </p>
          <button className="quiet" onClick={() => restore.current?.click()}>
            <Upload size={15} /> Restore a JSON backup
          </button>
        </Modal>
      )}
      {restoreInput}
      <div className="print-only">
        <pre>{rosterText(state)}</pre>
      </div>
    </div>
  );
}
