import { useEffect, useMemo, useRef, useState } from "react";
import MolView, { type Blob } from "./MolView";
import TokenTape, { Pills, TapeLegend, Transport } from "./TokenTape";
import {
  EDGE_ORANGE, NAVY, SINGLETON, communityColors, ease, edgeKey, emittedEdges, explode, fitMany, fitPoints, tokenStyle, useInView,
  useMolecules, walkTree, type Molecule, type P, type Tok, type TreeNode,
} from "./shared";

/**
 * Tabbed walkthrough of the coarse-to-fine pipeline (paper Figures 1-2,
 * Section 3), in the style of OmniMouse's model figure: each tab lights up the
 * modules active in one stage, and the panel below runs that stage on real
 * tokenizer output.
 */

type NodeId = "g" | "coarsen" | "h" | "ser" | "t" | "tf" | "that" | "dec" | "ghat";
type EdgeId = "g-coarsen" | "coarsen-h" | "h-ser" | "ser-t" | "t-tf" | "tf-that" | "that-dec" | "dec-ghat";

const BOX: Record<NodeId, { x: number; y: number; w: number; h: number; t: string; s: string; color: string }> = {
  g: { x: 10, y: 34, w: 150, h: 66, t: "Graph G", s: "atoms + bonds", color: "#e4e4e7" },
  coarsen: { x: 205, y: 34, w: 160, h: 66, t: "Coarsen", s: "HAC · Motif Community", color: "#fde2e2" },
  h: { x: 410, y: 34, w: 150, h: 66, t: "Partition tree ℋ", s: "communities, τ = 4", color: "#fecaca" },
  ser: { x: 605, y: 34, w: 160, h: 66, t: "HDT serializer", s: "one DFS over ℋ", color: "#dbeafe" },
  t: { x: 810, y: 34, w: 150, h: 66, t: "Tokens t", s: "coarse before fine", color: "#e0e7ff" },
  tf: { x: 790, y: 178, w: 170, h: 66, t: "Causal transformer", s: "GPT-2 XS · next token", color: "#fef3c7" },
  that: { x: 605, y: 178, w: 140, h: 66, t: "Sampled tokens", s: "t ∼ pθ(·)", color: "#e0e7ff" },
  dec: { x: 410, y: 178, w: 150, h: 66, t: "Decoder", s: "exact inverse", color: "#dcfce7" },
  ghat: { x: 10, y: 178, w: 355, h: 66, t: "Generated graph Ĝ", s: "decode ∘ tokenize ∘ coarsen(G) ≅ G", color: "#e4e4e7" },
};
const cx = (n: NodeId) => BOX[n].x + BOX[n].w / 2;
const cy = (n: NodeId) => BOX[n].y + BOX[n].h / 2;
const R = (n: NodeId) => BOX[n].x + BOX[n].w;
const Lf = (n: NodeId) => BOX[n].x;
const B = (n: NodeId) => BOX[n].y + BOX[n].h;
const T = (n: NodeId) => BOX[n].y;
const EDGES: Record<EdgeId, string> = {
  "g-coarsen": `M${R("g")},${cy("g")} L${Lf("coarsen")},${cy("coarsen")}`,
  "coarsen-h": `M${R("coarsen")},${cy("coarsen")} L${Lf("h")},${cy("h")}`,
  "h-ser": `M${R("h")},${cy("h")} L${Lf("ser")},${cy("ser")}`,
  "ser-t": `M${R("ser")},${cy("ser")} L${Lf("t")},${cy("t")}`,
  "t-tf": `M${cx("t")},${B("t")} L${cx("t")},${T("tf")}`,
  "tf-that": `M${Lf("tf")},${cy("tf")} L${R("that")},${cy("that")}`,
  "that-dec": `M${Lf("that")},${cy("that")} L${R("dec")},${cy("dec")}`,
  "dec-ghat": `M${Lf("dec")},${cy("dec")} L${R("ghat")},${cy("ghat")}`,
};

interface Stage {
  key: "overview" | "coarsen" | "serialize" | "learn" | "decode";
  tab: string;
  title: string;
  body: string[];
  nodes: NodeId[];
  edges: EdgeId[];
}

const ALL_N = Object.keys(BOX) as NodeId[];
const ALL_E = Object.keys(EDGES) as EdgeId[];

const STAGES: Stage[] = [
  {
    key: "overview",
    tab: "Overview",
    title: "Coarsen, serialize, predict, decode",
    body: [
      "A graph is coarsened into a partition tree ℋ, ℋ is serialized into one flat token sequence that states the community structure before the atom-level detail inside it, and an ordinary causal transformer learns that sequence by next-token prediction.",
      "Generation runs the transformer and parses its output back into a graph. Every stage except the transformer is a fixed, lossless transformation, so all differences between methods come from how the graph is presented to the model.",
    ],
    nodes: ALL_N,
    edges: ALL_E,
  },
  {
    key: "coarsen",
    tab: "1 · Coarsen",
    title: "Group atoms into communities",
    body: [
      "Motif Community (MC) detects ring systems with SMARTS queries, merges overlapping rings, and leaves the remaining atoms as singletons. Camptothecin becomes two ring systems and six singletons, exactly the C0 to C7 of Figure 1.",
      "HAC is domain-agnostic: agglomerative clustering that only merges clusters sharing an edge. It is applied recursively, splitting every community of at least τ = 4 nodes again, so ℋ can be several levels deep. Toggle between the two.",
    ],
    nodes: ["g", "coarsen", "h"],
    edges: ["g-coarsen", "coarsen-h"],
  },
  {
    key: "serialize",
    tab: "2 · Serialize (HDT)",
    title: "One depth-first pass over ℋ",
    body: [
      "HDT walks ℋ depth-first. Entering a community writes [ENTER] ℓ id, leaving it writes [EXIT]. Inside a leaf, each atom is written followed by a bracket listing every neighbor already written.",
      "That bracket holds intra- and cross-community bonds alike: cross-community connectivity uses exactly the same syntax, so no separate wiring section is needed and the sequence stays O(n + m). Step through Algorithm 1 below.",
    ],
    nodes: ["h", "ser", "t"],
    edges: ["h-ser", "ser-t"],
  },
  {
    key: "learn",
    tab: "3 · Learn",
    title: "Plain next-token prediction",
    body: [
      "The model is a standard GPT-2 XS (≈ 11M parameters) trained with the usual loss L(θ) = −Σᵢ log pθ(tᵢ | t<ᵢ). Nothing in the architecture knows about graphs or hierarchy.",
      "The causal mask decides what is input and what is target. Drag the position: the prefix (blue) is everything the model may look at, the next token (orange) is what it must predict. Because HDT is coarse before fine, the prefix already contains the community the next atom belongs to.",
    ],
    nodes: ["t", "tf"],
    edges: ["t-tf"],
  },
  {
    key: "decode",
    tab: "4 · Generate & decode",
    title: "Read the sequence back into a graph",
    body: [
      "Decoding parses the nested [ENTER] / [EXIT] blocks back into communities and each back-edge bracket back into bonds, then takes the union of all recovered edges.",
      "Shown is the paper's Figure 2 sample: a novel molecule generated by the COCONUT HDT-MC model. The grammar does not force a sampled sequence to be valid; malformed samples are counted invalid rather than repaired.",
    ],
    nodes: ["tf", "that", "dec", "ghat"],
    edges: ["tf-that", "that-dec", "dec-ghat"],
  },
];

/* ------------------------------------------------------------------ */

function useTween(target: P[] | null, ms = 900): P[] | null {
  const [cur, setCur] = useState<P[] | null>(target);
  const from = useRef<P[] | null>(target);
  useEffect(() => {
    if (!target) return;
    const start = performance.now();
    const src = from.current && from.current.length === target.length ? from.current : target;
    let id = 0;
    const tick = (now: number) => {
      const a = ease(Math.min(1, (now - start) / ms));
      const next = target.map((p, i) => [src[i][0] + (p[0] - src[i][0]) * a, src[i][1] + (p[1] - src[i][1]) * a] as P);
      from.current = next;
      setCur(next);
      if (a < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [target, ms]);
  return cur;
}

function usePlayback(len: number, inView: boolean, fps = 9) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing || !inView) return;
    const id = setInterval(() => {
      setT((v) => {
        if (v >= len) {
          setPlaying(false);
          return len;
        }
        return v + 1;
      });
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [playing, inView, len, fps]);
  return { t, setT, playing, setPlaying };
}

/** Top-level community blobs for a molecule under a given tree. */
function topBlobs(tree: TreeNode, color: Map<number, string>, pos: P[] | null, nested: boolean): Blob[] {
  const out: Blob[] = [];
  if (!pos) return out;
  (tree.ch ?? []).forEach((c) => {
    if (c.n.length > 1) out.push({ nodes: c.n, color: color.get(c.id)!, label: "" });
    if (nested)
      walkTree(c, (t) => {
        if (t !== c && t.n.length > 1) out.push({ nodes: t.n, color: color.get(c.id)!, opacity: 0.12, dashed: true });
      });
  });
  return out;
}

/* ---------------- Tree diagram (ℋ) ---------------- */

function TreeDiagram(props: {
  tree: TreeNode;
  order: number[];
  color: (n: number) => string;
  commColor: Map<number, string>;
  w: number;
  h: number;
  activePath?: Set<number>;
  emitted?: Set<number>;
  current?: number;
  bonds?: [number, number, number][];
  shownBonds?: Set<string>;
}) {
  const { tree, w, h } = props;
  const depth = (() => {
    let d = 0;
    walkTree(tree, (t) => (d = Math.max(d, t.d)));
    return d;
  })();
  const leafY = h - 46;
  const levelY = (d: number) => 18 + (d / (depth + 1)) * (leafY - 18);
  const pos = new Map<number, P>();
  const atomX = new Map<number, number>();
  const nLeaves = props.order.length;
  const step = (w - 30) / Math.max(1, nLeaves - 1);
  props.order.forEach((v, i) => atomX.set(v, 15 + i * step));
  walkTree(tree, (t) => {
    const xs = t.n.map((v) => atomX.get(v)!).filter((x) => x != null);
    pos.set(t.id, [(Math.min(...xs) + Math.max(...xs)) / 2, levelY(t.d)]);
  });
  const lines: React.ReactNode[] = [];
  const nodes: React.ReactNode[] = [];
  walkTree(tree, (t, parent) => {
    const [x, y] = pos.get(t.id)!;
    const on = props.activePath?.has(t.id);
    if (parent) {
      const [px, py] = pos.get(parent.id)!;
      lines.push(<line key={`e${t.id}`} x1={px} y1={py} x2={x} y2={y} stroke={on ? "#111" : "#a1a1aa"} strokeWidth={on ? 1.8 : 0.9} />);
    }
    if (!t.ch) for (const v of t.n) lines.push(<line key={`a${v}`} x1={x} y1={y} x2={atomX.get(v)!} y2={leafY} stroke={on ? "#52525b" : "#d4d4d8"} strokeWidth={0.8} />);
    const col = t.d === 0 ? NAVY : props.commColor.get(t.id) ?? SINGLETON;
    const r = t.d === 0 ? 10 : Math.max(4, 8 - t.d);
    nodes.push(
      <g key={`n${t.id}`}>
        {on && <circle cx={x} cy={y} r={r + 4} fill="none" stroke="#111" strokeWidth={1.5} />}
        <circle cx={x} cy={y} r={r} fill={col} stroke="#fff" strokeWidth={1} />
        {t.d === 0 && <text x={x} y={y + 3.5} fontSize={10} fontWeight={700} fill="#fff" textAnchor="middle">R</text>}
      </g>,
    );
  });
  const arcs = (props.bonds ?? []).map(([u, v], i) => {
    const x1 = atomX.get(u)!;
    const x2 = atomX.get(v)!;
    const shown = !props.shownBonds || props.shownBonds.has(edgeKey(u, v));
    const d = 6 + Math.abs(x2 - x1) * 0.18;
    return <path key={`b${i}`} d={`M${x1},${leafY + 6} Q${(x1 + x2) / 2},${leafY + 6 + d * 2} ${x2},${leafY + 6}`} fill="none" stroke={EDGE_ORANGE} strokeWidth={1.1} opacity={shown ? 0.85 : 0.08} />;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ overflow: "visible" }}>
      {lines}
      {arcs}
      {nodes}
      {props.order.map((v) => {
        const x = atomX.get(v)!;
        const em = !props.emitted || props.emitted.has(v);
        return (
          <g key={`l${v}`} opacity={em ? 1 : 0.25}>
            {props.current === v && <circle cx={x} cy={leafY} r={9} fill={EDGE_ORANGE} opacity={0.35} className="mosaic-pulse" />}
            <circle cx={x} cy={leafY} r={4.2} fill={props.color(v)} stroke="#fff" strokeWidth={0.8} />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------- Panels ---------------- */

const PW = 430;
const PH = 300;

function CoarsenPanel({ mol }: { mol: Molecule }) {
  const [strat, setStrat] = useState<"mc" | "hac">("mc");
  const [split, setSplit] = useState(true);
  const tree = mol.coarse[strat].tree;
  const { node, comm } = useMemo(() => communityColors(tree, mol.atoms.length), [tree, mol]);
  const [base, ex] = useMemo(() => fitMany([mol.xy, explode(mol.xy, (tree.ch ?? []).map((c) => c.n), 0.42)], PW, PH, 30), [mol, tree]);
  const target = split ? ex : base;
  const pos = useTween(target);
  const blobs = useMemo(() => topBlobs(tree, comm, pos, strat === "hac"), [tree, comm, pos, strat]);
  const cross = useMemo(() => {
    const top = new Array(mol.atoms.length).fill(-1);
    (tree.ch ?? []).forEach((c, i) => c.n.forEach((v) => (top[v] = i)));
    return new Set(mol.bonds.filter(([u, v]) => top[u] !== top[v]).map(([u, v]) => edgeKey(u, v)));
  }, [tree, mol]);
  const order = useMemo(() => mol.coarse[strat].hdt.filter((t) => t.k === "atom").map((t) => t.n), [mol, strat]);
  let depth = 0;
  walkTree(tree, (t) => (depth = Math.max(depth, t.d)));
  const k = tree.ch?.length ?? 1;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Pills small value={strat} onChange={setStrat} options={[["mc", "Motif Community"], ["hac", "HAC (recursive)"]]} />
        <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-600">
          <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} className="rounded" /> pull communities apart
        </label>
      </div>
      {pos && <MolView pos={pos} atoms={mol.atoms} bonds={mol.bonds} width={PW} height={PH} r={8} nodeColor={(i) => node[i]} blobs={blobs} crossBonds={cross} />}
      <div className="mt-1 text-[11px] text-zinc-500">
        Partition tree ℋ: <b className="text-zinc-800">{k}</b> top-level communities, <b className="text-zinc-800">{depth}</b> level{depth > 1 ? "s" : ""} below the root. Dashed bonds cross communities.
      </div>
      <div className="mt-1">
        <TreeDiagram tree={tree} order={order} color={(v) => node[v]} commColor={comm} w={PW} h={150} />
      </div>
    </div>
  );
}

const ALGO = [
  "t ← [SOS]; V_seen ← ∅",
  "TRAVERSE(R, ℓ = 0)",
  "t.append(EOS)",
  "procedure TRAVERSE(C, ℓ)",
  "  t.append(ENTER, ℓ, id(C))",
  "  if |C| ≤ τ then            ▷ leaf",
  "    for v ∈ C do",
  "      t.append(v)",
  "      B ← N_G(v) ∩ V_seen",
  "      if B ≠ ∅: t.append([, B, ])",
  "      V_seen ← V_seen ∪ {v}",
  "  else for child C′: TRAVERSE(C′, ℓ+1)",
  "  t.append(EXIT)",
];
const lineOf = (k: Tok["k"] | undefined): number => {
  switch (k) {
    case "sos": return 0;
    case "enter": case "lvl": case "cid": return 4;
    case "atom": return 7;
    case "lb": case "tgt": case "rb": return 9;
    case "exit": return 12;
    case "eos": return 2;
    default: return -1;
  }
};

function SerializePanel({ mol, inView }: { mol: Molecule; inView: boolean }) {
  const [strat, setStrat] = useState<"mc" | "hac">("mc");
  const tape = mol.coarse[strat].hdt;
  const tree = mol.coarse[strat].tree;
  const pb = usePlayback(tape.length, inView, 7);
  useEffect(() => {
    pb.setT(0);
    pb.setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strat]);
  const { node, comm } = useMemo(() => communityColors(tree, mol.atoms.length), [tree, mol]);
  const pos = useMemo(() => fitPoints(mol.xy, 300, 230, 20), [mol]);
  const order = useMemo(() => tape.filter((t) => t.k === "atom").map((t) => t.n), [tape]);
  const upto = pb.t;
  const cur = tape[Math.max(0, upto - 1)];
  const emitted = useMemo(() => new Set(tape.slice(0, upto).filter((t) => t.k === "atom").map((t) => t.n)), [tape, upto]);
  const shown = useMemo(() => new Set(emittedEdges(tape, upto, false).map(([u, v]) => edgeKey(u, v))), [tape, upto]);
  // Path of open communities at the cursor.
  const path = useMemo(() => {
    const parent = new Map<number, number>();
    walkTree(tree, (t, p) => p && parent.set(t.id, p.id));
    const s = new Set<number>();
    let c = cur?.c ?? -1;
    if (cur?.k === "exit") c = cur.c;
    while (c >= 0 && c !== undefined) {
      s.add(c);
      c = parent.get(c) ?? -1;
    }
    return s;
  }, [tree, cur]);
  let curAtom = -1;
  for (let i = upto - 1; i >= 0; i--) if (tape[i].k === "atom") { curAtom = tape[i].n; break; }
  const hot = new Set<string>();
  if (cur && (cur.k === "tgt" || cur.k === "rb" || cur.k === "lb")) for (let i = upto - 1; i >= 0 && tape[i].k !== "atom"; i--) if (tape[i].k === "tgt") hot.add(edgeKey(curAtom, tape[i].n));
  const line = lineOf(cur?.k);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Pills small value={strat} onChange={setStrat} options={[["mc", "HDT-MC"], ["hac", "HDT-HAC"]]} />
        <span className="ml-auto text-[11px] text-zinc-500">
          atoms written <b className="font-mono text-zinc-800">{emitted.size}/{mol.atoms.length}</b> · bonds written{" "}
          <b className="font-mono text-zinc-800">{shown.size}/{mol.bonds.length}</b>
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <pre className="m-0 overflow-x-auto rounded-lg bg-zinc-50 p-2 text-[10.5px] leading-[1.55] text-zinc-600">
          {ALGO.map((l, i) => (
            <div key={i} className="rounded px-1" style={{ background: i === line ? "#fde68a" : undefined, color: i === line ? "#111" : undefined, fontWeight: i === line ? 600 : 400 }}>
              {String(i + 1).padStart(2, " ")}  {l}
            </div>
          ))}
        </pre>
        <MolView pos={pos} atoms={mol.atoms} bonds={mol.bonds} width={300} height={230} r={7} nodeColor={(i) => node[i]} visible={emitted} shownBonds={shown} hotBonds={hot} current={curAtom} />
      </div>
      <TreeDiagram tree={tree} order={order} color={(v) => node[v]} commColor={comm} w={PW} h={140} activePath={path} emitted={emitted} current={curAtom} bonds={mol.bonds} shownBonds={shown} />
      <div className="mt-2">
        <TokenTape tape={tape} upto={upto} cursor={upto - 1} commColor={(_c, n) => node[n]} maxHeight={84} size="xs" onClickIndex={(i) => { pb.setPlaying(false); pb.setT(i + 1); }} />
      </div>
      <div className="mt-2">
        <Transport {...pb} max={tape.length} />
      </div>
    </div>
  );
}

function LearnPanel({ mol, inView }: { mol: Molecule; inView: boolean }) {
  const tape = mol.coarse.mc.hdt;
  const L = tape.length;
  const [i, setI] = useState(Math.floor(L * 0.55));
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || !inView) return;
    const id = setInterval(() => setI((v) => (v >= L - 1 ? (setPlaying(false), L - 1) : v + 1)), 120);
    return () => clearInterval(id);
  }, [playing, inView, L]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { node, comm } = useMemo(() => communityColors(mol.coarse.mc.tree, mol.atoms.length), [mol]);
  const colOf = (t: Tok) => (t.k === "atom" ? node[t.n] : tokenStyle(t).bg);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const S = 3;
    const n = L;
    c.width = n * S;
    c.height = n * S;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    // Visible region of every row (lower triangle), the current row emphasized.
    for (let r = 0; r < n; r++) {
      ctx.fillStyle = r < i - 1 ? "#dbe4f0" : "#ececef";
      ctx.fillRect(0, r * S, (r + 1) * S, S);
    }
    const row = i - 1;
    const band = 4 * S;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, row * S - band / 2, c.width, band + S);
    for (let q = 0; q <= row; q++) {
      ctx.fillStyle = colOf(tape[q]);
      ctx.fillRect(q * S, row * S - band / 2, S, band + S);
    }
    ctx.fillStyle = "#f97316";
    ctx.fillRect(i * S, row * S - band / 2 - S, S * 2, band + 3 * S);
    ctx.strokeStyle = "#18181b";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, row * S - band / 2 - 0.5, (row + 1) * S, band + S + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, L, tape]);
  const prefix = tape.slice(0, i);
  const emitted = new Set(prefix.filter((t) => t.k === "atom").map((t) => t.n));
  const shown = new Set(emittedEdges(tape, i, false).map(([u, v]) => edgeKey(u, v)));
  const pos = useMemo(() => fitPoints(mol.xy, 300, 220, 20), [mol]);
  const next = tape[i];
  // Communities currently open in the prefix
  const open: number[] = [];
  for (const t of prefix) {
    if (t.k === "enter") open.push(t.c);
    if (t.k === "exit") open.pop();
  }
  const openComm = open[open.length - 1];
  const tree = mol.coarse.mc.tree;
  const openNodes: number[] = [];
  walkTree(tree, (t) => {
    if (t.id === openComm && t.d > 0) openNodes.push(...t.n);
  });
  const blobs: Blob[] = openNodes.length > 1 ? [{ nodes: openNodes, color: comm.get(openComm) ?? SINGLETON, opacity: 0.25, dashed: true }] : [];
  const nextDesc =
    next?.k === "atom" ? `atom ${next.s} (inside the open community)` : next?.k === "tgt" ? `back-edge to atom ${next.s}` : next?.k === "enter" ? "open a new community" : next?.k === "exit" ? "close the community" : next ? next.s : "";
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <div className="mb-1 text-[11px] text-zinc-500">causal mask: each row sees only the tokens to its left (current row enlarged)</div>
          <canvas ref={canvas} className="aspect-square w-full rounded border border-zinc-200 [image-rendering:pixelated]" />
          <div className="mt-1">
            <TapeLegend items={[["#ececef", "visible to a row"], [NAVY, "structure"], [EDGE_ORANGE, "back-edge"], ["#FF6B6B", "atom (community color)"], ["#f97316", "target"]]} />
          </div>
        </div>
        <div>
          <div className="mb-1 text-[11px] text-zinc-500">what the prefix t&lt;{i} already encodes</div>
          <MolView pos={pos} atoms={mol.atoms} bonds={mol.bonds} width={300} height={220} r={7} nodeColor={(k) => node[k]} visible={emitted} shownBonds={shown} blobs={blobs} />
          <div className="mt-2 rounded-lg bg-zinc-50 p-2 font-mono text-[12px] text-zinc-700">
            p<sub>θ</sub>( t<sub>{i}</sub> | t<sub>&lt;{i}</sub> ) → next token: <b style={{ color: "#c2410c" }}>{nextDesc}</b>
          </div>
        </div>
      </div>
      <div className="mt-2">
        <TokenTape tape={tape} ghost upto={tape.length} cursor={i} commColor={(_c, n) => node[n]} zone={{ from: 0, to: i, color: "#60a5fa" }} maxHeight={84} size="xs" onClickIndex={(k) => setI(Math.max(1, k))} />
      </div>
      <div className="mt-2">
        <Transport playing={playing} setPlaying={setPlaying} t={i} setT={(v) => setI(Math.max(1, Math.min(L - 1, v)))} max={L - 1} label={`i = ${i}`} />
      </div>
    </div>
  );
}

function DecodePanel({ mol, inView }: { mol: Molecule; inView: boolean }) {
  const tape = mol.coarse.mc.hdt;
  const pb = usePlayback(tape.length, inView, 8);
  const tree = mol.coarse.mc.tree;
  const { node, comm } = useMemo(() => communityColors(tree, mol.atoms.length), [tree, mol]);
  const pos = useMemo(() => fitPoints(mol.xy, PW, 250, 26), [mol]);
  const upto = pb.t;
  const emitted = new Set(tape.slice(0, upto).filter((t) => t.k === "atom").map((t) => t.n));
  const shown = new Set(emittedEdges(tape, upto, false).map(([u, v]) => edgeKey(u, v)));
  // Parser stack and closed communities.
  const stack: number[] = [];
  const closed = new Set<number>();
  for (const t of tape.slice(0, upto)) {
    if (t.k === "enter") stack.push(t.c);
    if (t.k === "exit") closed.add(stack.pop()!);
  }
  const blobs: Blob[] = [];
  walkTree(tree, (t) => {
    if (t.d === 1 && t.n.length > 1 && (closed.has(t.id) || stack.includes(t.id)))
      blobs.push({ nodes: t.n.filter((v) => emitted.has(v)), color: comm.get(t.id)!, opacity: closed.has(t.id) ? 0.25 : 0.1, dashed: !closed.has(t.id) });
  });
  let curAtom = -1;
  for (let i = upto - 1; i >= 0; i--) if (tape[i].k === "atom") { curAtom = tape[i].n; break; }
  const done = upto >= tape.length;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        <span>parser stack:</span>
        <span className="flex flex-wrap gap-1 font-mono">
          {stack.length === 0 ? <span>∅</span> : stack.map((c, k) => (
            <span key={k} className="rounded px-1.5 py-0.5 text-white" style={{ background: k === 0 ? NAVY : comm.get(c) ?? SINGLETON }}>
              {k === 0 ? "R" : `C${tape.find((t) => t.c === c && t.k === "cid")?.s ?? "?"}`}
            </span>
          ))}
        </span>
        <span className="ml-auto">
          atoms <b className="font-mono text-zinc-800">{emitted.size}</b> · bonds <b className="font-mono text-zinc-800">{shown.size}</b>
        </span>
      </div>
      <div className="relative">
        <MolView pos={pos} atoms={mol.atoms} bonds={mol.bonds} width={PW} height={250} r={8} nodeColor={(i) => (emitted.has(i) ? node[i] : "#d4d4d8")} visible={emitted} shownBonds={shown} blobs={blobs} current={curAtom} />
        {done && (
          <div className="absolute top-1 right-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
            ✓ valid · novel w.r.t. the COCONUT training set
          </div>
        )}
      </div>
      <div className="mt-1 truncate font-mono text-[10.5px] text-zinc-400">{done ? mol.smiles : " "}</div>
      <div className="mt-1">
        <TokenTape tape={tape} upto={upto} cursor={upto - 1} commColor={(_c, n) => node[n]} maxHeight={84} size="xs" />
      </div>
      <div className="mt-2">
        <Transport {...pb} max={tape.length} />
      </div>
    </div>
  );
}

function OverviewPanel({ mol }: { mol: Molecule }) {
  const tree = mol.coarse.mc.tree;
  const { node, comm } = useMemo(() => communityColors(tree, mol.atoms.length), [tree, mol]);
  const base = useMemo(() => fitPoints(mol.xy, 200, 200, 16), [mol]);
  const ex = useMemo(() => fitPoints(explode(mol.xy, (tree.ch ?? []).map((c) => c.n), 0.45), 200, 200, 18), [mol, tree]);
  const blobs = topBlobs(tree, comm, ex, false);
  const tape = mol.coarse.mc.hdt;
  const Arrow = () => <div className="flex items-center justify-center text-xl text-zinc-400">→</div>;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1.3fr]">
      <div>
        <MolView pos={base} atoms={mol.atoms} bonds={mol.bonds} width={200} height={200} r={6} />
        <div className="text-center text-[11px] text-zinc-500">input molecule</div>
      </div>
      <Arrow />
      <div>
        <MolView pos={ex} atoms={mol.atoms} bonds={mol.bonds} width={200} height={200} r={6} nodeColor={(i) => node[i]} blobs={blobs} blobR={11} />
        <div className="text-center text-[11px] text-zinc-500">communities</div>
      </div>
      <div className="hidden sm:block"><Arrow /></div>
      <div className="col-span-3 sm:col-span-1">
        <TokenTape tape={tape} commColor={(_c, n) => node[n]} maxHeight={200} size="xs" />
        <div className="mt-1 text-center text-[11px] text-zinc-500">HDT tokens (atom / bond types omitted)</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function PipelineExplorer({ base }: { base: string }) {
  const mols = useMolecules(base);
  const [k, setK] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const stage = STAGES[k];
  const on = useMemo(() => new Set<string>([...stage.nodes, ...stage.edges]), [stage]);
  const campto = mols?.find((m) => m.key === "camptothecin");
  const gen = mols?.find((m) => m.key === "generated");

  return (
    <div ref={ref} className="not-prose rounded-2xl border border-zinc-200 bg-white p-3 sm:p-5">
      <style>{`@keyframes mflow { to { stroke-dashoffset: -24; } } .mflow { animation: mflow 0.9s linear infinite; }`}</style>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs tracking-wide text-zinc-400 uppercase">interactive</span>
        {STAGES.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setK(i)}
            className={`rounded-full px-3 py-1 text-sm transition ${i === k ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}
          >
            {s.tab}
          </button>
        ))}
      </div>
      <svg viewBox="0 0 970 256" className="w-full">
        <defs>
          <marker id="parr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#52525b" />
          </marker>
        </defs>
        <text x={10} y={20} fontSize={11} fill="#a1a1aa" letterSpacing={1}>ENCODE (EVERY TRAINING GRAPH)</text>
        <text x={10} y={164} fontSize={11} fill="#a1a1aa" letterSpacing={1}>GENERATE</text>
        <line x1={10} x2={960} y1={142} y2={142} stroke="#f4f4f5" strokeDasharray="4 4" />
        <text x={cx("t") + 8} y={(B("t") + T("tf")) / 2 + 4} fontSize={10.5} fill="#71717a">train</text>
        {(Object.keys(EDGES) as EdgeId[]).map((e) => {
          const active = on.has(e);
          return (
            <g key={e} opacity={active ? 1 : 0.18}>
              <path d={EDGES[e]} fill="none" stroke="#52525b" strokeWidth={1.6} markerEnd="url(#parr)" />
              {active && <path d={EDGES[e]} fill="none" stroke="#f59e0b" strokeWidth={3} strokeDasharray="4 20" className="mflow" />}
            </g>
          );
        })}
        {(Object.keys(BOX) as NodeId[]).map((n) => {
          const b = BOX[n];
          const active = on.has(n);
          return (
            <g key={n} opacity={active ? 1 : 0.25} style={{ transition: "opacity .3s" }}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill={b.color} stroke={active ? "#18181b" : "#a1a1aa"} strokeWidth={active ? 1.6 : 1} />
              <text x={b.x + b.w / 2} y={b.y + b.h / 2 - 4} fontSize={14} fontWeight={600} textAnchor="middle" fill="#18181b">{b.t}</text>
              <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 15} fontSize={11.5} textAnchor="middle" fill="#52525b">{b.s}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-3 grid gap-5 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
        <div>
          <div className="text-base font-semibold text-zinc-900">{stage.title}</div>
          {stage.body.map((p, i) => (
            <p key={i} className="mt-2 text-[0.93rem] leading-relaxed text-zinc-600">{p}</p>
          ))}
          {stage.key === "serialize" && (
            <div className="mt-3">
              <TapeLegend items={[[NAVY, "SOS / ENTER ℓ id / EXIT / EOS"], ["#FF6B6B", "atom (community color)"], [SINGLETON, "singleton atom"], [EDGE_ORANGE, "back-edge bracket"]]} />
              <p className="mt-2 text-xs text-zinc-500">Click any token to jump there.</p>
            </div>
          )}
        </div>
        <div className="min-w-0">
          {!campto || !gen ? (
            <div className="h-80 animate-pulse rounded-xl bg-zinc-100" />
          ) : (
            <>
              {stage.key === "overview" && <OverviewPanel mol={campto} />}
              {stage.key === "coarsen" && <CoarsenPanel mol={campto} />}
              {stage.key === "serialize" && <SerializePanel mol={campto} inView={inView} />}
              {stage.key === "learn" && <LearnPanel mol={campto} inView={inView} />}
              {stage.key === "decode" && <DecodePanel mol={gen} inView={inView} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
