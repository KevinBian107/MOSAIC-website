import { useEffect, useRef } from "react";
import { tokenStyle, type Tok } from "./shared";

/**
 * A wrapped strip of token chips. Tokens at index >= `upto` are hidden (or
 * ghosted), the token at `cursor` is outlined, and hovering an atom or a
 * back-edge target reports its source node.
 */
interface Props {
  tape: Tok[];
  upto?: number;
  cursor?: number;
  ghost?: boolean;
  commColor?: (c: number, n: number) => string;
  onHoverNode?: (n: number | null) => void;
  hoverNode?: number | null;
  /** Mark tokens [from, to) e.g. to show the model's input prefix. */
  zone?: { from: number; to: number; color: string } | null;
  maxHeight?: number;
  size?: "xs" | "sm";
  autoScroll?: boolean;
  onClickIndex?: (i: number) => void;
}

export default function TokenTape(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const curRef = useRef<HTMLSpanElement>(null);
  const upto = p.upto ?? p.tape.length;
  useEffect(() => {
    if (p.autoScroll === false || !box.current || !curRef.current) return;
    const b = box.current;
    const c = curRef.current;
    const top = c.offsetTop - b.offsetTop;
    if (top < b.scrollTop || top > b.scrollTop + b.clientHeight - 24) b.scrollTop = Math.max(0, top - b.clientHeight / 2);
  }, [p.cursor, p.autoScroll]);
  const sz = p.size === "xs" ? "text-[10px] px-[3px] py-[0px] min-w-[13px]" : "text-[11px] px-1 py-[1px] min-w-[16px]";
  return (
    <div
      ref={box}
      className="relative flex flex-wrap content-start gap-[2px] overflow-y-auto font-mono leading-none"
      style={{ maxHeight: p.maxHeight ?? 160 }}
    >
      {p.tape.map((t, i) => {
        if (i >= upto && !p.ghost) return null;
        const st = tokenStyle(t, p.commColor);
        const isCur = i === p.cursor;
        const hov = p.hoverNode != null && t.n === p.hoverNode && (t.k === "atom" || t.k === "tgt");
        const inZone = p.zone && i >= p.zone.from && i < p.zone.to;
        return (
          <span
            key={i}
            ref={isCur ? curRef : undefined}
            onMouseEnter={p.onHoverNode && t.n >= 0 ? () => p.onHoverNode!(t.n) : undefined}
            onMouseLeave={p.onHoverNode ? () => p.onHoverNode!(null) : undefined}
            onClick={p.onClickIndex ? () => p.onClickIndex!(i) : undefined}
            className={`inline-flex items-center justify-center rounded-[3px] ${sz} ${p.onClickIndex ? "cursor-pointer" : ""}`}
            style={{
              background: st.bg,
              color: st.fg,
              opacity: i >= upto ? 0.12 : 1,
              outline: isCur ? "2px solid #111" : hov ? "2px solid #FF8C00" : inZone ? `2px solid ${p.zone!.color}` : undefined,
              outlineOffset: isCur || hov ? 1 : 0,
              transform: isCur ? "scale(1.12)" : undefined,
              transition: "opacity .2s, transform .15s",
              fontWeight: t.k === "atom" ? 700 : 500,
            }}
          >
            {t.s}
          </span>
        );
      })}
    </div>
  );
}

/** Legend for chip colors. */
export function TapeLegend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
      {items.map(([c, l]) => (
        <span key={l} className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  );
}

/** Play / pause / step / scrub controls shared by the playback figures. */
export function Transport(p: {
  playing: boolean;
  setPlaying: (b: boolean) => void;
  t: number;
  setT: (n: number) => void;
  max: number;
  speed?: number;
  setSpeed?: (s: number) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <button
        aria-label={p.playing ? "Pause" : "Play"}
        onClick={() => {
          if (!p.playing && p.t >= p.max) p.setT(0);
          p.setPlaying(!p.playing);
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white hover:bg-zinc-700"
      >
        {p.playing ? (
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="0" width="3" height="10" fill="currentColor" /><rect x="6" y="0" width="3" height="10" fill="currentColor" /></svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 0 L10 5 L1 10z" fill="currentColor" /></svg>
        )}
      </button>
      <button aria-label="Step back" onClick={() => { p.setPlaying(false); p.setT(Math.max(0, p.t - 1)); }} className="rounded px-1.5 py-0.5 hover:bg-zinc-100">◀</button>
      <button aria-label="Step forward" onClick={() => { p.setPlaying(false); p.setT(Math.min(p.max, p.t + 1)); }} className="rounded px-1.5 py-0.5 hover:bg-zinc-100">▶</button>
      <input
        type="range"
        min={0}
        max={p.max}
        value={p.t}
        onChange={(e) => { p.setPlaying(false); p.setT(+e.target.value); }}
        className="h-1 min-w-0 flex-1 accent-zinc-900"
      />
      <span className="w-20 shrink-0 text-right font-mono tabular-nums">{p.label ?? `${p.t}/${p.max}`}</span>
      {p.setSpeed && (
        <select value={p.speed} onChange={(e) => p.setSpeed!(+e.target.value)} className="rounded border-zinc-200 py-0 pr-6 pl-1.5 text-xs">
          {[0.5, 1, 2, 4].map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
      )}
    </div>
  );
}

/** Pill-shaped toggle group. */
export function Pills<T extends string>(p: { value: T; options: [T, string][]; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {p.options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => p.onChange(v)}
          className={`rounded-full ${p.small ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm"} transition ${
            v === p.value ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
