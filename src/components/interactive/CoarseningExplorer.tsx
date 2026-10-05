import { useMemo, useState } from "react";
import MolView, { type Blob } from "./MolView";
import { Pills } from "./TokenTape";
import {
  COMMUNITY_PALETTE, NAVY, SINGLETON, communityColors, edgeKey, explode, fitPoints, useMolecules, walkTree, type Molecule,
  type TreeNode,
} from "./shared";

/**
 * Axis 1: where communities come from. One molecule under three coarsenings:
 * recursive HAC (domain-agnostic), Motif Community (ring systems), and the
 * typed MC+FG partition HDTC consumes (ring / functional group / singleton).
 * The icicle below shows the partition tree level by level.
 */
type Strat = "hac" | "mc" | "typed";
const TYPE_COLOR = { R: "#FF6B6B", F: "#4ECDC4", S: SINGLETON };
const W = 520;
const H = 360;

function typedTree(mol: Molecule): TreeNode {
  return {
    id: 0,
    n: mol.atoms.map((_, i) => i),
    d: 0,
    ch: mol.typed.map((c, i) => ({ id: i + 1, n: c.n, d: 1, o: c.n })),
  };
}

function Icicle({ tree, color, w }: { tree: TreeNode; color: Map<number, string>; w: number }) {
  let depth = 0;
  walkTree(tree, (t) => (depth = Math.max(depth, t.d)));
  const rowH = 20;
  const total = tree.n.length;
  const rects: React.ReactNode[] = [];
  const place = (t: TreeNode, x0: number) => {
    const width = (t.n.length / total) * w;
    rects.push(
      <g key={t.id}>
        <rect x={x0 + 0.5} y={t.d * (rowH + 3)} width={Math.max(0, width - 1)} height={rowH} rx={3} fill={t.d === 0 ? NAVY : color.get(t.id) ?? SINGLETON} opacity={t.d === 0 ? 1 : Math.max(0.45, 1 - (t.d - 1) * 0.18)} />
        {width > 22 && (
          <text x={x0 + width / 2} y={t.d * (rowH + 3) + 14} fontSize={10} textAnchor="middle" fill="#fff" fontWeight={600}>
            {t.d === 0 ? `root · ${t.n.length} atoms` : t.n.length}
          </text>
        )}
      </g>,
    );
    let x = x0;
    for (const c of t.ch ?? []) {
      place(c, x);
      x += (c.n.length / total) * w;
    }
  };
  place(tree, 0);
  return (
    <svg viewBox={`0 0 ${w} ${(depth + 1) * (rowH + 3)}`} className="w-full">
      {rects}
    </svg>
  );
}

export default function CoarseningExplorer({ base }: { base: string }) {
  const mols = useMolecules(base);
  const [key, setKey] = useState("cholesterol");
  const [strat, setStrat] = useState<Strat>("hac");
  const mol = mols?.find((m) => m.key === key);

  const view = useMemo(() => {
    if (!mol) return null;
    const tree = strat === "typed" ? typedTree(mol) : mol.coarse[strat].tree;
    let node: string[];
    let comm: Map<number, string>;
    if (strat === "typed") {
      node = new Array(mol.atoms.length).fill(SINGLETON);
      comm = new Map();
      mol.typed.forEach((c, i) => {
        c.n.forEach((v) => (node[v] = TYPE_COLOR[c.type]));
        comm.set(i + 1, TYPE_COLOR[c.type]);
      });
    } else {
      ({ node, comm } = communityColors(tree, mol.atoms.length));
    }
    const top = tree.ch ?? [];
    const pos = fitPoints(explode(mol.xy, top.map((c) => c.n), 0.3), W, H, 34);
    const blobs: Blob[] = [];
    top.forEach((c) => {
      if (c.n.length > 1 || strat === "typed") blobs.push({ nodes: c.n, color: comm.get(c.id)!, opacity: 0.2 });
      walkTree(c, (t) => {
        if (t !== c && t.n.length > 1) blobs.push({ nodes: t.n, color: comm.get(c.id)!, opacity: 0.1, dashed: true });
      });
    });
    const topOf = new Array(mol.atoms.length).fill(-1);
    top.forEach((c, i) => c.n.forEach((v) => (topOf[v] = i)));
    const cross = new Set(mol.bonds.filter(([u, v]) => topOf[u] !== topOf[v]).map(([u, v]) => edgeKey(u, v)));
    let depth = 0;
    walkTree(tree, (t) => (depth = Math.max(depth, t.d)));
    const leaves: number[] = [];
    walkTree(tree, (t) => !t.ch && leaves.push(t.n.length));
    return { tree, node, comm, pos, blobs, cross, k: top.length, depth, leaves, nCross: cross.size };
  }, [mol, strat]);

  if (!mols || !mol || !view) return <div className="h-[520px] animate-pulse rounded-2xl bg-zinc-100" />;
  const meanLeaf = view.leaves.reduce((a, b) => a + b, 0) / view.leaves.length;
  return (
    <div className="not-prose rounded-2xl border border-zinc-200 bg-white p-3 sm:p-5">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Pills small value={key} onChange={setKey} options={mols.map((m) => [m.key, m.name.replace(" (COCONUT HDT-MC)", "")] as [string, string])} />
      </div>
      <div className="mb-3">
        <Pills value={strat} onChange={setStrat} options={[["hac", "HAC (domain-agnostic)"], ["mc", "Motif Community"], ["typed", "MC + functional groups (HDTC)"]]} />
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <MolView pos={view.pos} atoms={mol.atoms} bonds={mol.bonds} width={W} height={H} r={8.5} nodeColor={(i) => view.node[i]} blobs={view.blobs} crossBonds={view.cross} />
        <div className="flex flex-col gap-3 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              [view.k, "top-level communities"],
              [view.depth, "levels below root"],
              [meanLeaf.toFixed(1), "mean leaf size"],
            ].map(([v, l]) => (
              <div key={String(l)} className="rounded-lg bg-zinc-50 p-2">
                <div className="text-xl font-semibold text-zinc-900 tabular-nums">{v}</div>
                <div className="text-[11px] leading-tight text-zinc-500">{l}</div>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 text-[11px] text-zinc-500">partition tree ℋ, one row per level (widths = community sizes)</div>
            <Icicle tree={view.tree} color={view.comm} w={360} />
          </div>
          <p className="text-[13px] leading-relaxed text-zinc-600">
            {strat === "hac" && "HAC needs no chemistry: it merges adjacent clusters bottom-up and recurses into every community of at least τ = 4 atoms. Its communities need not be recognizable motifs, but they are compact and of controlled size; dashed outlines mark the nested sub-communities."}
            {strat === "mc" && "Motif Community finds ring systems with a fixed SMARTS catalogue, merges fused rings, and keeps the remaining atoms as singletons. Its granularity depends entirely on which motifs the molecule contains."}
            {strat === "typed" && "HDTC's MC+FG partition adds a functional-group detector with a fixed priority (rings, then multi-atom groups, then single atoms) and labels each community ring (R), functional group (F) or singleton (S). The label is written into the sequence."}
          </p>
          {strat === "typed" && (
            <div className="flex gap-3 text-[11px] text-zinc-500">
              {(["R", "F", "S"] as const).map((t) => (
                <span key={t} className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLOR[t] }} /> {t === "R" ? "ring" : t === "F" ? "functional group" : "singleton"}
                </span>
              ))}
            </div>
          )}
          <div className="text-[11px] text-zinc-400">
            {view.nCross} of {mol.bonds.length} bonds cross top-level communities (dashed). {COMMUNITY_PALETTE.length > 0 && ""}
          </div>
        </div>
      </div>
    </div>
  );
}
