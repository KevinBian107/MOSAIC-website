import { useEffect, useMemo, useRef, useState } from "react";
import MolView from "./MolView";
import TokenTape, { Pills, Transport } from "./TokenTape";
import {
  SINGLETON, communityColors, edgeKey, emittedEdges, fitPoints, useInView, useMolecules, type Molecule, type Tok,
} from "./shared";

/**
 * Same molecule, two serializations played in lockstep (by fraction of each
 * sequence). Atoms are colored by their Motif-Community community in both
 * panels, so the strip under each tape shows how often consecutive atoms
 * switch community: a flat walk weaves between rings, HDT finishes one
 * community before entering the next.
 */
const MOLS = ["camptothecin", "cholesterol", "reserpine", "strychnine", "erythromycin"];
const PW = 360;
const PH = 250;

function atomTrack(tape: Tok[], color: string[]) {
  return tape.map((t, i) => ({ i, col: t.k === "atom" ? color[t.n] : null })).filter((x) => x.col) as { i: number; col: string }[];
}

function switches(tape: Tok[], comm: number[], upto: number): number {
  let prev = -2;
  let n = 0;
  for (let i = 0; i < upto; i++) {
    const t = tape[i];
    if (t.k !== "atom") continue;
    const c = comm[t.n];
    if (prev !== -2 && c !== prev) n++;
    prev = c;
  }
  return n;
}

function Panel(props: {
  title: string;
  sub: string;
  mol: Molecule;
  tape: Tok[];
  upto: number;
  pos: [number, number][];
  color: string[];
  comm: number[];
  flat: boolean;
  bonds: Set<string>;
  hover: number | null;
  setHover: (n: number | null) => void;
}) {
  const { mol, tape, upto } = props;
  const visible = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i < upto; i++) if (tape[i].k === "atom") s.add(tape[i].n);
    return s;
  }, [tape, upto]);
  const shown = useMemo(() => new Set(emittedEdges(tape, upto, props.flat, props.bonds).map(([u, v]) => edgeKey(u, v))), [tape, upto, props.flat, props.bonds]);
  const hot = useMemo(() => {
    const s = new Set<string>();
    // back-edges of the most recent atom
    let j = upto - 1;
    while (j >= 0 && tape[j].k !== "atom") j--;
    if (j < 0) return s;
    const src = tape[j].n;
    for (let i = j + 1; i < upto; i++) if (tape[i].k === "tgt") s.add(edgeKey(src, tape[i].n));
    return s;
  }, [tape, upto]);
  let cur = -1;
  for (let i = Math.min(upto, tape.length) - 1; i >= 0; i--) if (tape[i].k === "atom") { cur = tape[i].n; break; }
  const track = atomTrack(tape, props.color);
  const nAtoms = track.length;
  const doneAtoms = track.filter((x) => x.i < upto).length;
  const sw = switches(tape, props.comm, upto);
  return (
    <div className="min-w-0 rounded-xl border border-zinc-200 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-zinc-900">{props.title}</div>
        <div className="text-xs text-zinc-500">{props.sub}</div>
      </div>
      <MolView
        pos={props.pos}
        atoms={mol.atoms}
        bonds={mol.bonds}
        width={PW}
        height={PH}
        r={8}
        nodeColor={(i) => props.color[i]}
        visible={visible}
        shownBonds={shown}
        hotBonds={hot}
        current={cur}
        highlight={props.hover != null ? new Set([props.hover]) : undefined}
        onHover={props.setHover}
      />
      <div className="mt-1 mb-1 flex items-center justify-between text-[11px] text-zinc-500">
        <span>community of each emitted atom, in order</span>
        <span className="font-mono tabular-nums">
          community switches: <b className="text-zinc-900">{sw}</b>
        </span>
      </div>
      <div className="mb-2 flex h-3 w-full overflow-hidden rounded-sm bg-zinc-100">
        {track.map((x, k) => (
          <div key={k} style={{ width: `${100 / nAtoms}%`, background: x.col, opacity: k < doneAtoms ? 1 : 0.12 }} />
        ))}
      </div>
      <TokenTape tape={tape} upto={upto} cursor={upto - 1} commColor={(_c, n) => props.color[n]} hoverNode={props.hover} onHoverNode={props.setHover} maxHeight={118} size="xs" />
    </div>
  );
}

export default function FlatVsHier({ base }: { base: string }) {
  const mols = useMolecules(base);
  const [key, setKey] = useState("camptothecin");
  const [t, setT] = useState(0); // 0..1000 progress
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const started = useRef(false);

  useEffect(() => {
    if (inView && !started.current) {
      started.current = true;
      setPlaying(true);
    }
  }, [inView]);

  useEffect(() => {
    if (!playing || !inView) return;
    const id = setInterval(() => setT((v) => (v >= 1000 ? (setPlaying(false), 1000) : v + 4)), 40);
    return () => clearInterval(id);
  }, [playing, inView]);

  const mol = mols?.find((m) => m.key === key);
  const geo = useMemo(() => {
    if (!mol) return null;
    const tree = mol.coarse.mc.tree;
    const { node } = communityColors(tree, mol.atoms.length);
    const comm = new Array(mol.atoms.length).fill(-1);
    (tree.ch ?? []).forEach((c, i) => c.n.forEach((v) => (comm[v] = i)));
    // Singletons: color gray but keep their own id (each is its own community).
    const color = node.map((c) => c);
    const pos = fitPoints(mol.xy, PW, PH, 22);
    const bonds = new Set(mol.bonds.map(([u, v]) => edgeKey(u, v)));
    return { color, comm, pos, bonds };
  }, [mol]);

  if (!mol || !geo) return <div ref={ref} className="h-[520px] animate-pulse rounded-2xl bg-zinc-100" />;
  const sent = mol.sent[0];
  const hdt = mol.coarse.mc.hdt;
  const uS = Math.round((t / 1000) * sent.length);
  const uH = Math.round((t / 1000) * hdt.length);

  return (
    <div ref={ref} className="not-prose rounded-2xl border border-zinc-200 bg-white p-3 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Pills
          small
          value={key}
          onChange={(k) => { setKey(k); setT(0); setPlaying(true); }}
          options={MOLS.map((k) => [k, mols!.find((m) => m.key === k)!.name] as [string, string])}
        />
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SINGLETON }} /> singleton
          <span className="ml-2 inline-block h-[3px] w-4 bg-[#FF8C00]" /> back-edge just written
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Flat walk (SENT)" sub={`${sent.length} structure tokens`} mol={mol} tape={sent} upto={uS} pos={geo.pos} color={geo.color} comm={geo.comm} flat bonds={geo.bonds} hover={hover} setHover={setHover} />
        <Panel title="Hierarchical traversal (HDT-MC)" sub={`${hdt.length} structure tokens`} mol={mol} tape={hdt} upto={uH} pos={geo.pos} color={geo.color} comm={geo.comm} flat={false} bonds={geo.bonds} hover={hover} setHover={setHover} />
      </div>
      <div className="mt-3">
        <Transport playing={playing} setPlaying={setPlaying} t={t} setT={setT} max={1000} label={`${Math.round(t / 10)}%`} />
      </div>
    </div>
  );
}
