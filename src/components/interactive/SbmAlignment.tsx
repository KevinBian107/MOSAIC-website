import { useMemo, useState } from "react";
import { Pills } from "./TokenTape";
import { COMMUNITY_PALETTE, blobPath, fitPoints, useGraphs, walkTree, type P, type TreeNode } from "./shared";

/**
 * SBM deep dive (paper Tables 18-19, panel A). The same SBM graph under three
 * hierarchies: default HAC (τ = 4), HAC with τ = 44, and the planted blocks
 * (PH, a privileged control). Leaves are colored individually so
 * over-refinement shows up as confetti.
 */
type Hier = "hac4" | "hac44" | "ph";
const STATS: Record<Hier, { label: string; leaf: string; depth: string; top: string; leafAri: string; R: number[]; FR: number[] }> = {
  hac4: { label: "HAC, τ = 4 (default)", leaf: "2.25", depth: "4.98", top: "0.942", leafAri: "0.065", R: [0.926, 0.406, 0.408, 0.276], FR: [0.445, 0.999, 0.999, 0.445] },
  hac44: { label: "HAC, τ = 44", leaf: "30.42", depth: "1.00", top: "0.942", leafAri: "0.942", R: [0.709, 1.0, 1.0, 0.709], FR: [0.694, 1.0, 1.0, 0.694] },
  ph: { label: "Planted hierarchy (control)", leaf: "30.63", depth: "1.00", top: "1.000", leafAri: "1.000", R: [0.887, 1.0, 1.0, 0.887], FR: [0.848, 1.0, 1.0, 0.848] },
};
const SENT = [0.669, 1.0, 1.0, 0.669];
const COLS = ["Valid", "Unique", "Novel", "V.U.N."];
const W = 520;
const H = 380;

function Bars({ title, vals }: { title: string; vals: number[] }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-zinc-600">{title}</div>
      <div className="grid grid-cols-4 gap-2">
        {vals.map((v, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="relative h-24 w-full rounded bg-zinc-100">
              <div className="absolute bottom-0 w-full rounded transition-all duration-500" style={{ height: `${v * 100}%`, background: i === 3 ? "#2563eb" : "#93c5fd" }} />
              <div className="absolute w-full border-t-2 border-dashed border-zinc-700" style={{ bottom: `${SENT[i] * 100}%` }} title="SENT" />
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-zinc-800 tabular-nums">{v.toFixed(3)}</div>
            <div className="text-[10px] text-zinc-500">{COLS[i]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SbmAlignment({ base }: { base: string }) {
  const graphs = useGraphs(base);
  const [h, setH] = useState<Hier>("hac4");
  const g = graphs?.find((x) => x.key === "sbm");

  const view = useMemo(() => {
    if (!g) return null;
    const pos = fitPoints(g.xy, W, H, 20, false);
    let tree: TreeNode;
    if (h === "ph") {
      tree = { id: 0, n: [...Array(g.n).keys()], d: 0, ch: (g.planted as number[][]).map((b, i) => ({ id: i + 1, n: b, d: 1, o: b })) };
    } else tree = g.trees[h];
    const leaves: number[][] = [];
    walkTree(tree, (t) => !t.ch && leaves.push(t.n));
    const color = new Array(g.n).fill("#999");
    leaves.forEach((l, i) => l.forEach((v) => (color[v] = COMMUNITY_PALETTE[(i * 7) % COMMUNITY_PALETTE.length])));
    const tops = (tree.ch ?? []).map((c) => c.n);
    return { pos, leaves, color, tops };
  }, [g, h]);

  if (!g || !view) return <div className="h-[460px] animate-pulse rounded-2xl bg-zinc-100" />;
  const st = STATS[h];
  return (
    <div className="not-prose rounded-2xl border border-zinc-200 bg-white p-3 sm:p-5">
      <div className="mb-3">
        <Pills value={h} onChange={setH} options={(Object.keys(STATS) as Hier[]).map((k) => [k, STATS[k].label] as [Hier, string])} />
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-zinc-50">
            {view.tops.map((t, i) => (
              <path key={i} d={blobPath(t.map((v) => view.pos[v]) as P[], 12)} fill="none" stroke="#71717a" strokeDasharray="5 4" strokeWidth={1.2} />
            ))}
            {g.edges.map(([u, v], i) => (
              <line key={i} x1={view.pos[u][0]} y1={view.pos[u][1]} x2={view.pos[v][0]} y2={view.pos[v][1]} stroke={view.color[u] === view.color[v] ? view.color[u] : "#d4d4d8"} strokeOpacity={view.color[u] === view.color[v] ? 0.7 : 0.35} strokeWidth={0.8} />
            ))}
            {view.pos.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={4.3} fill={view.color[i]} stroke="#fff" strokeWidth={0.9} style={{ transition: "fill .4s" }} />
            ))}
          </svg>
          <p className="mt-1 text-center text-[11px] text-zinc-500">
            {view.leaves.length} leaf communities on this graph (each its own color); dashed outlines are top-level communities.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 text-center">
            {[
              [st.leaf, "mean leaf size"],
              [st.depth, "mean max depth"],
              [st.top, "top-level ARI"],
              [st.leafAri, "leaf ARI vs planted"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-lg bg-zinc-50 p-1.5">
                <div className="text-lg font-semibold text-zinc-900 tabular-nums">{v}</div>
                <div className="text-[10.5px] text-zinc-500">{l}</div>
              </div>
            ))}
          </div>
          <Bars title="HDT -R (within-community randomization)" vals={st.R} />
          <Bars title="HDT -FR (hierarchy-wide randomization)" vals={st.FR} />
          <div className="text-[11px] text-zinc-500">Dashed line: SENT (V.U.N. 0.669). Stats over the 128 training graphs; V.U.N. means over seeds 42–44 (paper Tables 18–19).</div>
        </div>
      </div>
    </div>
  );
}
