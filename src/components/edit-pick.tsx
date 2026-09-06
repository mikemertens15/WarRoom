"use client";
import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { snakeOrder } from "@/lib/draft";
import type { DraftState } from "@/lib/types";
import { Modal, PositionBadge } from "./ui";

export default function EditPick({
  state,
  index,
  onClose,
  onPick,
}: {
  state: DraftState;
  index: number;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const slot = snakeOrder(state.league.order)[index];
  const used = new Set(state.picks.filter((_, i) => i !== index));
  const candidates = state.players
    .filter(
      (p) =>
        !used.has(p.id) &&
        p.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .includes(query.toLowerCase().replace(/[^a-z0-9]/g, "")),
    )
    .slice(0, 12);
  const existing = state.players.find((p) => p.id === state.picks[index]);
  return (
    <Modal
      title={`Edit pick #${index + 1}`}
      subtitle={`Round ${slot.round} · ${state.league.teams[slot.team]}${existing ? ` · Currently ${existing.name}` : " · Empty pick"}`}
      onClose={onClose}
    >
      <p className="help-text">
        Choose a replacement. The old player returns to the pool; all other
        picks stay in place. Undo can reverse this correction.
      </p>
      <label className="edit-search">
        <Search size={18} />
        <input
          aria-label="Search replacement player"
          placeholder="Search for a player…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((i) => Math.min(i + 1, candidates.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((i) => Math.max(0, i - 1));
            }
            if (e.key === "Enter" && candidates[selected])
              onPick(candidates[selected].id);
          }}
        />
      </label>
      <div className="edit-results">
        {candidates.map((p, i) => (
          <button
            className={i === selected ? "selected" : ""}
            key={p.id}
            onClick={() => onPick(p.id)}
          >
            <PositionBadge pos={p.position} />
            <strong>{p.name}</strong>
            <span>{p.team}</span>
            <ArrowRight size={15} />
          </button>
        ))}
        {!candidates.length && <p>No available player matches.</p>}
      </div>
    </Modal>
  );
}
