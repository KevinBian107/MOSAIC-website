/**
 * Shared data access, palettes and geometry for the interactive figures.
 *
 * All figures read `public/data/{molecules,graphs}.json`, produced by
 * `scripts/website/export_website_data.py` in the MOSAIC repository from the
 * real coarseners and tokenizers. Tokens are array-encoded as
 * [kindCode, label, sourceNode, communityId].
 */
import { useEffect, useState } from "react";

export type Kind =
  | "sos" | "eos" | "enter" | "lvl" | "cid" | "exit" | "atom" | "lb" | "tgt" | "rb"
  | "reset" | "sep" | "bip" | "bipn" | "type" | "num" | "struct";

export interface Tok {
  k: Kind;
  s: string;
  n: number; // source node (-1 if none)
  c: number; // community id (-1 if none)
}

export interface TreeNode {
  id: number;
  n: number[];
  d: number;
  ch?: TreeNode[];
  o?: number[];
}

export interface Coarse {
  tree: TreeNode;
  hdt: Tok[];
  R: Tok[][];
  FR: Tok[][];
}

export interface Molecule {
  key: string;
  name: string;
  smiles: string;
  note: string;
  atoms: string[];
  bonds: [number, number, number][];
  xy: [number, number][];
  typed: { type: "R" | "F" | "S"; n: number[] }[];
  coarse: { hac: Coarse; mc: Coarse };
  sent: Tok[][];
  hsent: Tok[];
  hdtc: Tok[];
}

export interface GraphRec {
  key: string;
  name: string;
  n: number;
  edges: [number, number][];
  xy: [number, number][];
  trees: Record<string, TreeNode>;
  planted?: number[][] | number[][][];
}

type RawTok = [number, string, number, number];
interface RawCoarse { tree: TreeNode; hdt: RawTok[]; R: RawTok[][]; FR: RawTok[][] }
interface RawMol extends Omit<Molecule, "coarse" | "sent" | "hsent" | "hdtc"> {
  kinds: Kind[];
  coarse: { hac: RawCoarse; mc: RawCoarse };
  sent: RawTok[][];
  hsent: RawTok[];
  hdtc: RawTok[];
}

const decodeTape = (kinds: Kind[], t: RawTok[]): Tok[] => t.map(([k, s, n, c]) => ({ k: kinds[k], s, n, c }));

let molPromise: Promise<Molecule[]> | null = null;
let graphPromise: Promise<GraphRec[]> | null = null;

export const asset = (base: string, path: string): string =>
  (base.endsWith("/") ? base : base + "/") + path.replace(/^\//, "");

function loadMolecules(base: string): Promise<Molecule[]> {
  if (!molPromise) {
    molPromise = fetch(asset(base, "data/molecules.json"))
      .then((r) => r.json())
      .then((raw: RawMol[]) =>
        raw.map((m) => {
          const dc = (c: RawCoarse): Coarse => ({
            tree: c.tree,
            hdt: decodeTape(m.kinds, c.hdt),
            R: c.R.map((t) => decodeTape(m.kinds, t)),
            FR: c.FR.map((t) => decodeTape(m.kinds, t)),
          });
          return {
            ...m,
            coarse: { hac: dc(m.coarse.hac), mc: dc(m.coarse.mc) },
            sent: m.sent.map((t) => decodeTape(m.kinds, t)),
            hsent: decodeTape(m.kinds, m.hsent),
            hdtc: decodeTape(m.kinds, m.hdtc),
          };
        }),
      );
  }
  return molPromise;
}

function loadGraphs(base: string): Promise<GraphRec[]> {
  if (!graphPromise) graphPromise = fetch(asset(base, "data/graphs.json")).then((r) => r.json());
  return graphPromise;
}

export function useMolecules(base: string): Molecule[] | null {
  const [m, setM] = useState<Molecule[] | null>(null);
  useEffect(() => {
    let live = true;
    loadMolecules(base).then((v) => live && setM(v));
    return () => {
      live = false;
    };
  }, [base]);
  return m;
}

export function useGraphs(base: string): GraphRec[] | null {
  const [g, setG] = useState<GraphRec[] | null>(null);
  useEffect(() => {
    let live = true;
    loadGraphs(base).then((v) => live && setG(v));
    return () => {
      live = false;
    };
  }, [base]);
  return g;
}

/* ------------------------------------------------------------------ */
/* Palettes (follow the paper's figures)                               */
/* ------------------------------------------------------------------ */

export const COMMUNITY_PALETTE = [
  "#FF6B6B", "#4ECDC4", "#F5B93D", "#9B59B6", "#FF8C42", "#27AE60", "#3498DB", "#E91E63", "#16A085", "#C0A060",
  "#6C5CE7", "#00B894", "#E17055", "#0984E3", "#B33771", "#3B9C9C",
];
export const SINGLETON = "#A3ACB0";
export const EDGE_ORANGE = "#FF8C00";
export const NAVY = "#16213e";
export const BIP_PURPLE = "#7c3aed";

export const ELEMENT_COLORS: Record<string, string> = {
  C: "#3f3f46", N: "#3050F8", O: "#E5212B", S: "#D4A80F", F: "#62B830", Cl: "#1DB954", Br: "#A62929", P: "#FF8000", I: "#940094",
};

/** Chip colors per token kind (atoms get their community color instead). */
export function tokenStyle(t: Tok, commColor?: (c: number, n: number) => string): { bg: string; fg: string; border?: string } {
  switch (t.k) {
    case "sos": case "eos": case "enter": case "exit": case "lvl": case "cid": case "sep":
      return { bg: NAVY, fg: "#fff" };
    case "reset":
      return { bg: "#52525b", fg: "#fff" };
    case "lb": case "rb": case "tgt":
      return { bg: EDGE_ORANGE, fg: "#fff" };
    case "bip": case "bipn":
      return { bg: BIP_PURPLE, fg: "#fff" };
    case "type":
      return { bg: "#0f766e", fg: "#fff" };
    case "atom":
      return { bg: commColor ? commColor(t.c, t.n) : "#e4e4e7", fg: "#111" };
    default:
      return { bg: "#e4e4e7", fg: "#27272a" };
  }
}

/* ------------------------------------------------------------------ */
/* Tree helpers                                                        */
/* ------------------------------------------------------------------ */

export function walkTree(t: TreeNode, f: (n: TreeNode, parent: TreeNode | null) => void, parent: TreeNode | null = null) {
  f(t, parent);
  t.ch?.forEach((c) => walkTree(c, f, t));
}

/** node -> top-level community index (0..k-1) in tree order. */
export function topLevelOf(tree: TreeNode, nNodes: number): number[] {
  const out = new Array(nNodes).fill(-1);
  (tree.ch ?? [tree]).forEach((c, i) => c.n.forEach((v) => (out[v] = i)));
  return out;
}

/** node -> leaf community id. */
export function leafOf(tree: TreeNode, nNodes: number): number[] {
  const out = new Array(nNodes).fill(-1);
  walkTree(tree, (t) => {
    if (!t.ch) t.n.forEach((v) => (out[v] = t.id));
  });
  return out;
}

export function treeDepth(t: TreeNode): number {
  return t.ch ? 1 + Math.max(...t.ch.map(treeDepth)) : 0;
}

/**
 * Color function for a coarsened molecule: top-level communities with more than
 * one atom get palette colors in tree order, singletons are gray.
 */
export function communityColors(tree: TreeNode, nNodes: number): { node: string[]; comm: Map<number, string> } {
  const node = new Array(nNodes).fill(SINGLETON);
  const comm = new Map<number, string>();
  let k = 0;
  (tree.ch ?? [tree]).forEach((c) => {
    const col = c.n.length > 1 ? COMMUNITY_PALETTE[k++ % COMMUNITY_PALETTE.length] : SINGLETON;
    walkTree(c, (t) => comm.set(t.id, col));
    c.n.forEach((v) => (node[v] = col));
  });
  comm.set(tree.id, "#e4e4e7");
  return { node, comm };
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export type P = [number, number];

/** Fit points into a w x h box with padding; returns transformed points. */
export function fitPoints(pts: P[], w: number, h: number, pad = 24, flipY = true): P[] {
  if (!pts.length) return [];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => (flipY ? -p[1] : p[1]));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = Math.min((w - 2 * pad) / Math.max(x1 - x0, 1e-6), (h - 2 * pad) / Math.max(y1 - y0, 1e-6));
  const ox = (w - s * (x1 - x0)) / 2 - s * x0;
  const oy = (h - s * (y1 - y0)) / 2 - s * y0;
  return pts.map((_p, i) => [ox + s * xs[i], oy + s * ys[i]]);
}

/** Fit several point sets with one shared transform (so tweening between them stays in frame). */
export function fitMany(sets: P[][], w: number, h: number, pad = 24): P[][] {
  const all = sets.flat();
  const n = sets[0].length;
  const fitted = fitPoints(all, w, h, pad);
  return sets.map((_, k) => fitted.slice(k * n, (k + 1) * n));
}

function cross(o: P, a: P, b: P) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

export function convexHull(points: P[]): P[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length <= 2) return p;
  const lower: P[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: P[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Rounded "blob" path around a set of points (hull of discs of radius r). */
export function blobPath(points: P[], r: number): string {
  if (!points.length) return "";
  const ring: P[] = [];
  const N = 14;
  for (const [x, y] of points) for (let i = 0; i < N; i++) ring.push([x + r * Math.cos((2 * Math.PI * i) / N), y + r * Math.sin((2 * Math.PI * i) / N)]);
  const h = convexHull(ring);
  if (h.length < 3) return "";
  // Smooth with quadratic curves through edge midpoints.
  const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M${mid(h[h.length - 1], h[0]).join(",")}`;
  for (let i = 0; i < h.length; i++) {
    const m = mid(h[i], h[(i + 1) % h.length]);
    d += ` Q${h[i][0].toFixed(1)},${h[i][1].toFixed(1)} ${m[0].toFixed(1)},${m[1].toFixed(1)}`;
  }
  return d + "Z";
}

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Rigidly push each community away from the centroid ("exploded" coarsening view). */
export function explode(pts: P[], groups: number[][], strength: number): P[] {
  const c: P = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const out = pts.map((p) => [...p] as P);
  for (const g of groups) {
    if (!g.length) continue;
    const gx = g.reduce((s, v) => s + pts[v][0], 0) / g.length;
    const gy = g.reduce((s, v) => s + pts[v][1], 0) / g.length;
    for (const v of g) {
      out[v] = [pts[v][0] + (gx - c[0]) * strength, pts[v][1] + (gy - c[1]) * strength];
    }
  }
  return out;
}

/** requestAnimationFrame loop with play/pause; calls f(dtSeconds). */
export function useRaf(f: (dt: number) => void, running: boolean) {
  useEffect(() => {
    if (!running) return;
    let id = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      f(dt);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
}

/** True while the element is on screen (pauses offscreen animations). */
export function useInView<T extends Element>(ref: React.RefObject<T | null>): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => setV(e.isIntersecting), { threshold: 0.05 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref]);
  return v;
}

/** Edges emitted by a tape prefix: walk steps (SENT) and back-edges. */
export function emittedEdges(tape: Tok[], upto: number, flat: boolean, bonds?: Set<string>): [number, number][] {
  const out: [number, number][] = [];
  let lastAtom = -1;
  let prevWalk = -1;
  for (let i = 0; i < Math.min(upto, tape.length); i++) {
    const t = tape[i];
    if (t.k === "atom") {
      if (flat && prevWalk >= 0 && (!bonds || bonds.has(edgeKey(prevWalk, t.n)))) out.push([prevWalk, t.n]);
      lastAtom = t.n;
      prevWalk = t.n;
    } else if (t.k === "tgt" && t.n >= 0 && lastAtom >= 0) {
      out.push([lastAtom, t.n]);
    } else if (t.k === "reset") {
      prevWalk = -1;
    }
  }
  return out;
}

export const edgeKey = (u: number, v: number) => (u < v ? `${u}-${v}` : `${v}-${u}`);
