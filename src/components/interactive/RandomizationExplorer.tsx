import { useEffect, useMemo, useRef, useState } from "react";
import MolView from "./MolView";
import TokenTape, { Pills } from "./TokenTape";
import { communityColors, edgeKey, emittedEdges, fitPoints, useInView, useMolecules, type Tok } from "./shared";

/**
 * Axis 3: order randomization. Each training presentation resamples traversal
 * choices while the graph and ℋ stay fixed. -R keeps the stored community
 * order and reshuffles atoms inside each terminal community; -FR also samples
 * an adjacency-constrained DFS over communities at every level. All samples
 * are real outputs of HDTTokenizer with the corresponding policy.
 */
type Policy = "det" | "R" | "FR";
const W = 460;
const H = 330;

function topOrder(tape: Tok[], topOf: number[]): number[] {
  const seq: number[] = [];
  for (const t of tape) if (t.k === "atom") {
    const c = topOf[t.n];
    if (seq[seq.length - 1] !== c) seq.push(c);
  }
  return seq;
}

export default function RandomizationExplorer({ base }: { base: string }) {
  const mols = useMolecules(base);
  const [key, setKey] = useState("camptothecin");
  const [strat, setStrat] = useState<"hac" | "mc">("mc");
  const [policy, setPolicy] = useState<Policy>("FR");
  const [sample, setSample] = useState(0);
  const [t, setT] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const mol = mols?.find((m) => m.key === key);
  const coarse = mol?.coarse[strat];
  const tapes = coarse ? (policy === "det" ? [coarse.hdt] : coarse[policy]) : [];
  const tape = tapes[sample % Math.max(1, tapes.length)] ?? [];

  useEffect(() => setT(0), [key, strat, policy, sample]);
  useEffect(() => {
    if (!inView || !tape.length) return;
    const id = setInterval(() => setT((v) => Math.min(tape.length, v + 2)), 30);
    return () => clearInterval(id);
  }, [inView, tape]);

  const geo = useMemo(() => {
    if (!mol || !coarse) return null;
    const { node } = communityColors(coarse.tree, mol.atoms.length);
    const topOf = new Array(mol.atoms.length).fill(-1);
    (coarse.tree.ch ?? []).forEach((c, i) => c.n.forEach((v) => (topOf[v] = i)));
    return { node, topOf, pos: fitPoints(mol.xy, W, H, 26) };
  }, [mol, coarse]);

  if (!mols || !mol || !geo) return <div ref={ref} className="h-[520px] animate-pulse rounded-2xl bg-zinc-100" />;

  const visitRank = new Map<number, number>();
  for (const tk of tape.slice(0, t)) if (tk.k === "atom" && !visitRank.has(tk.n)) visitRank.set(tk.n, visitRank.size);
  const labels = new Map<number, string>();
  visitRank.forEach((r, n) => labels.set(n, String(r)));
  const shown = new Set(emittedEdges(tape, t, false).map(([u, v]) => edgeKey(u, v)));
  const order = topOrder(tape, geo.topOf);
  const commColorTop = (c: number) => geo.node[(mol.coarse[strat].tree.ch ?? [])[c]?.n[0] ?? 0];

  return (
    <div ref={ref} className="not-prose rounded-2xl border border-zinc-200 bg-white p-3 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pills small value={key} onChange={(k) => { setKey(k); setSample(0); }} options={mols.filter((m) => m.key !== "generated").map((m) => [m.key, m.name] as [string, string])} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pills value={policy} onChange={(p) => { setPolicy(p); setSample(0); }} options={[["det", "Deterministic"], ["R", "-R  within community"], ["FR", "-FR  hierarchy-wide"]]} />
        <button
          disabled={policy === "det"}
          onClick={() => setSample((s) => s + 1)}
          className="rounded-full bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700 disabled:bg-zinc-200 disabled:text-zinc-400"
        >
          ↻ resample ({(sample % Math.max(1, tapes.length)) + 1}/{tapes.length})
        </button>
        <span className="ml-auto">
          <Pills small value={strat} onChange={(s) => { setStrat(s); setSample(0); }} options={[["mc", "MC"], ["hac", "HAC"]]} />
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div>
          <MolView pos={geo.pos} atoms={mol.atoms} bonds={mol.bonds} width={W} height={H} r={9} nodeColor={(i) => geo.node[i]} visible={new Set(visitRank.keys())} shownBonds={shown} labels={labels} showElements={false} />
          <p className="mt-1 text-center text-[11px] text-zinc-500">Numbers are serialization ids, assigned in first-visit order.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <div className="mb-1 text-[11px] text-zinc-500">order in which top-level communities are entered</div>
            <div className="flex flex-wrap gap-1">
              {order.map((c, i) => (
                <span key={i} className="rounded px-1.5 py-0.5 font-mono text-[11px] text-white" style={{ background: commColorTop(c) }}>
                  {String.fromCharCode(65 + (c % 26))}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[11px] text-zinc-500">all samples of this policy (community entry order)</div>
            <div className="flex flex-col gap-1">
              {tapes.slice(0, 8).map((tp, si) => (
                <button key={si} onClick={() => setSample(si)} className={`flex items-center gap-[2px] rounded px-1 py-0.5 ${si === sample % tapes.length ? "bg-zinc-100 ring-1 ring-zinc-300" : "hover:bg-zinc-50"}`}>
                  <span className="w-5 text-[10px] text-zinc-400">{si + 1}</span>
                  {topOrder(tp, geo.topOf).map((c, i) => (
                    <span key={i} className="inline-block h-3 w-3 rounded-[2px]" style={{ background: commColorTop(c) }} />
                  ))}
                </button>
              ))}
            </div>
          </div>
          <TokenTape tape={tape} upto={t} cursor={t - 1} commColor={(_c, n) => geo.node[n]} maxHeight={110} size="xs" />
          <p className="text-[12.5px] leading-relaxed text-zinc-600">
            {policy === "det" && "One fixed string per graph per epoch. SENT, by contrast, draws a fresh random walk every time, which is a form of data augmentation the deterministic hierarchy lacks."}
            {policy === "R" && "-R keeps the stored community order (the colored row never changes) and restarts a random-root BFS with shuffled neighbors inside each terminal community."}
            {policy === "FR" && "-FR also samples a randomized DFS over sibling communities at every level. A community is entered through an atom adjacent to the one it was reached from, and ids follow encounter order."}
          </p>
        </div>
      </div>
    </div>
  );
}
