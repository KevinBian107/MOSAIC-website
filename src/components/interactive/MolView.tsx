import { useMemo } from "react";
import { ELEMENT_COLORS, blobPath, edgeKey, type P } from "./shared";

/**
 * SVG molecule / graph renderer shared by the figures.
 *
 * Positions are given in SVG pixels. Optional layers: community blobs (drawn
 * under everything), emitted-bond filtering (for token-by-token playback),
 * back-edge highlights and a "current atom" pulse.
 */
export interface Blob {
  nodes: number[];
  color: string;
  label?: string;
  opacity?: number;
  dashed?: boolean;
}

interface Props {
  pos: P[];
  atoms?: string[];
  bonds: [number, number, number][];
  width: number;
  height: number;
  r?: number;
  blobs?: Blob[];
  blobR?: number;
  /** Atom fill; defaults to element colors. */
  nodeColor?: (i: number) => string;
  /** Atoms not in this set are drawn faint. */
  visible?: Set<number> | null;
  /** Bonds not in this set (edgeKey) are drawn faint. */
  shownBonds?: Set<string> | null;
  /** Bonds drawn in orange (e.g. the back-edges just emitted). */
  hotBonds?: Set<string>;
  /** Bonds drawn dashed gray (cross-community). */
  crossBonds?: Set<string>;
  current?: number;
  highlight?: Set<number>;
  labels?: Map<number, string>;
  showElements?: boolean;
  onHover?: (i: number | null) => void;
  className?: string;
  children?: React.ReactNode;
}

export default function MolView(p: Props) {
  const r = p.r ?? 9;
  const blobR = p.blobR ?? r * 1.9;
  const blobs = useMemo(
    () => (p.blobs ?? []).map((b) => ({ ...b, d: blobPath(b.nodes.map((i) => p.pos[i]), blobR) })),
    [p.blobs, p.pos, blobR],
  );
  return (
    <svg viewBox={`0 0 ${p.width} ${p.height}`} className={p.className ?? "w-full"} style={{ overflow: "visible" }}>
      <g>
        {blobs.map((b, i) => (
          <path
            key={i}
            d={b.d}
            fill={b.color}
            fillOpacity={b.opacity ?? 0.22}
            stroke={b.color}
            strokeOpacity={0.9}
            strokeWidth={1.4}
            strokeDasharray={b.dashed ? "4 3" : undefined}
            style={{ transition: "fill-opacity .3s" }}
          />
        ))}
      </g>
      <g>
        {p.bonds.map(([u, v, o], i) => {
          const key = edgeKey(u, v);
          const shown = !p.shownBonds || p.shownBonds.has(key);
          const hot = p.hotBonds?.has(key);
          const cross = p.crossBonds?.has(key);
          const [x1, y1] = p.pos[u];
          const [x2, y2] = p.pos[v];
          const dx = x2 - x1;
          const dy = y2 - y1;
          const L = Math.hypot(dx, dy) || 1;
          const nx = (-dy / L) * 3.2;
          const ny = (dx / L) * 3.2;
          const col = hot ? "#FF8C00" : cross ? "#8b8b93" : "#52525b";
          const sw = hot ? 3 : 1.9;
          const op = shown ? 1 : 0.1;
          const lines: [number, number][] = o === 2 ? [[-0.5, 0.5], [0.5, 0.5]] : o === 3 ? [[-1, 1], [0, 1], [1, 1]] : [[0, 1]];
          return (
            <g key={i} opacity={op} style={{ transition: "opacity .25s" }}>
              {lines.map(([k], j) => (
                <line
                  key={j}
                  x1={x1 + nx * k}
                  y1={y1 + ny * k}
                  x2={x2 + nx * k}
                  y2={y2 + ny * k}
                  stroke={col}
                  strokeWidth={o > 1 ? sw * 0.75 : sw}
                  strokeDasharray={cross && !hot ? "3 3" : undefined}
                  strokeLinecap="round"
                />
              ))}
            </g>
          );
        })}
      </g>
      <g>
        {p.pos.map(([x, y], i) => {
          const el = p.atoms?.[i] ?? "C";
          const vis = !p.visible || p.visible.has(i);
          const fill = p.nodeColor ? p.nodeColor(i) : ELEMENT_COLORS[el] ?? "#808080";
          const hi = p.highlight?.has(i);
          const label = p.labels?.get(i) ?? (p.showElements !== false && el !== "C" ? el : "");
          return (
            <g
              key={i}
              opacity={vis ? 1 : 0.13}
              style={{ transition: "opacity .25s" }}
              onMouseEnter={p.onHover ? () => p.onHover!(i) : undefined}
              onMouseLeave={p.onHover ? () => p.onHover!(null) : undefined}
            >
              {p.current === i && <circle cx={x} cy={y} r={r * 2} fill="#FF8C00" opacity={0.25} className="mosaic-pulse" />}
              {hi && <circle cx={x} cy={y} r={r * 1.65} fill="none" stroke="#111" strokeWidth={2} />}
              <circle cx={x} cy={y} r={r} fill={fill} stroke="#fff" strokeWidth={1.4} />
              <circle cx={x - r * 0.3} cy={y - r * 0.35} r={r * 0.32} fill="#fff" opacity={0.28} />
              {label && (
                <text x={x} y={y + r * 0.38} fontSize={r * 1.05} fontWeight={700} textAnchor="middle" fill="#fff" style={{ pointerEvents: "none" }}>
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </g>
      {p.children}
    </svg>
  );
}
