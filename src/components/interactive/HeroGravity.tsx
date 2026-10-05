import { useEffect, useMemo, useRef, useState } from "react";
import {
  ELEMENT_COLORS, EDGE_ORANGE, NAVY, blobPath, communityColors, edgeKey, emittedEdges, explode, fitPoints, tokenStyle,
  useInView, useMolecules, type P,
} from "./shared";

/**
 * Hero animation on camptothecin (paper Figures 1-2). Atoms are point masses on
 * damped springs; each phase moves their spring anchors. Encoding pulls the
 * molecule into its Motif-Community islands and lifts it into the partition
 * tree while the HDT tape is written. Generation then writes the tape again
 * token by token: every atom token leaves its chip and flies into place, every
 * back-edge draws its bond, and every [EXIT] shades the community it closes.
 */
const W = 600;
const H = 430;
const TAPE_X = 14;
const TAPE_Y = H - 124;
const PHASES = [
  { key: "graph", label: "Graph G", dur: 2.6, text: "A molecule is a graph: atoms and bonds, no natural order." },
  { key: "coarsen", label: "Coarsen", dur: 2.8, text: "Coarsening pulls atoms into communities: ring systems and leftover singletons." },
  { key: "tree", label: "Partition tree ℋ", dur: 4.4, text: "One depth-first pass over ℋ writes the sequence, coarse before fine; every bond becomes a back-edge (orange)." },
  { key: "decode", label: "Generate & decode", dur: 7.2, text: "Generation writes tokens one at a time. Each atom token turns into an atom, each back-edge into a bond, and each [EXIT] closes a community." },
];
const GEN_FRAC = 0.72; // share of the decode phase spent generating tokens

/** Lay out token chips in SVG so each atom can start from its own chip. */
function layoutTape(labels: string[], maxW: number) {
  const out: { x: number; y: number; w: number }[] = [];
  let x = 0;
  let y = 0;
  for (const s of labels) {
    const w = 6 + s.length * 5.5;
    if (x + w > maxW) {
      x = 0;
      y += 13;
    }
    out.push({ x, y, w });
    x += w + 2;
  }
  return out;
}

export default function HeroGravity({ base }: { base: string }) {
  const mols = useMolecules(base);
  const mol = mols?.find((m) => m.key === "camptothecin");
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [phase, setPhase] = useState(0);
  const [, setFrame] = useState(0);
  const [auto, setAuto] = useState(true);
  const phaseRef = useRef(0);
  const autoRef = useRef(true);
  autoRef.current = auto;
  const state = useRef<{ pos: P[]; vel: P[]; t: number; phaseT: number; born: boolean[]; lastKey: string } | null>(null);

  const geo = useMemo(() => {
    if (!mol) return null;
    const tree = mol.coarse.mc.tree;
    const comms = tree.ch ?? [];
    const { node: color } = communityColors(tree, mol.atoms.length);
    const molPos = fitPoints(mol.xy, W, H - 110, 46).map(([x, y]) => [x, y + 6] as P);
    const groups = comms.map((c) => c.n);
    const exploded = fitPoints(explode(mol.xy, groups, 0.55), W, H - 110, 34).map(([x, y]) => [x, y + 6] as P);
    const tape = mol.coarse.mc.hdt;
    const order = tape.filter((t) => t.k === "atom").map((t) => t.n);
    // Partition-tree layout: leaves in HDT emission order.
    const leafY = 230;
    const commY = 140;
    const rootY = 62;
    const gap = 9;
    const step = (W - 70 - gap * (comms.length - 1)) / Math.max(1, order.length - 1);
    const treePos: P[] = new Array(mol.atoms.length);
    let x = 35;
    const commPos: P[] = [];
    for (const c of comms) {
      const leaves = c.o ?? order.filter((v) => c.n.includes(v));
      const x0 = x;
      for (const v of leaves) {
        treePos[v] = [x, leafY];
        x += step;
      }
      commPos.push([(x0 + x - step) / 2, commY]);
      x += gap;
    }
    const commOf = new Array(mol.atoms.length).fill(0);
    comms.forEach((c, i) => c.n.forEach((v) => (commOf[v] = i)));
    const commColor = comms.map((c) => color[c.n[0]]);
    const chips = layoutTape(tape.map((t) => t.s), W - 2 * TAPE_X);
    const atomTok = new Array(mol.atoms.length).fill(0);
    tape.forEach((t, i) => t.k === "atom" && (atomTok[t.n] = i));
    // Index of the [EXIT] token that closes each top-level community.
    const closeTok = comms.map((c) => {
      let last = -1;
      tape.forEach((t, i) => t.k === "exit" && t.c === c.id && (last = i));
      return last;
    });
    const molBlobs = groups.map((g) => (g.length > 1 ? blobPath(g.map((v) => molPos[v]), 17) : ""));
    return { color, molPos, exploded, treePos, commPos, commOf, commColor, groups, tape, chips, atomTok, closeTok, molBlobs, root: [W / 2, rootY] as P };
  }, [mol]);

  useEffect(() => {
    if (!geo) return;
    state.current = {
      pos: geo.molPos.map((p) => [...p] as P),
      vel: geo.molPos.map(() => [0, 0] as P),
      t: 0,
      phaseT: 0,
      born: geo.molPos.map(() => true),
      lastKey: "graph",
    };
  }, [geo]);

  useEffect(() => {
    if (!geo || !inView) return;
    let id = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const s = state.current!;
      s.t += dt;
      s.phaseT += dt;
      if (autoRef.current && s.phaseT > PHASES[phaseRef.current].dur) {
        s.phaseT = 0;
        phaseRef.current = (phaseRef.current + 1) % PHASES.length;
        setPhase(phaseRef.current);
      }
      const key = PHASES[phaseRef.current].key;
      if (key !== s.lastKey) {
        s.born = s.born.map(() => key !== "decode");
        s.lastKey = key;
      }
      if (key === "decode") {
        // Atoms are born at their token chip as soon as that token is generated.
        const upto = Math.floor(Math.min(1, s.phaseT / (PHASES[3].dur * GEN_FRAC)) * geo.tape.length);
        for (let v = 0; v < s.pos.length; v++) {
          if (!s.born[v] && geo.atomTok[v] < upto) {
            const c = geo.chips[geo.atomTok[v]];
            s.pos[v] = [TAPE_X + c.x + c.w / 2, TAPE_Y + c.y + 5];
            s.vel[v] = [0, -260];
            s.born[v] = true;
          }
        }
      }
      const target = key === "coarsen" ? geo.exploded : key === "tree" ? geo.treePos : geo.molPos;
      const kSpring = key === "decode" ? 34 : 26;
      const damp = key === "decode" ? 9 : 7.5;
      for (let i = 0; i < s.pos.length; i++) {
        if (!s.born[i]) continue;
        const delay = key === "tree" ? geo.commOf[i] * 0.06 : key === "coarsen" ? geo.commOf[i] * 0.04 : 0;
        if (s.phaseT < delay) continue;
        const jitter = key === "graph" ? 1.4 : 0.4;
        const tx = target[i][0] + Math.sin(s.t * 1.3 + i * 1.7) * jitter;
        const ty = target[i][1] + Math.cos(s.t * 1.1 + i * 2.3) * jitter;
        s.vel[i][0] += (kSpring * (tx - s.pos[i][0]) - damp * s.vel[i][0]) * dt;
        s.vel[i][1] += (kSpring * (ty - s.pos[i][1]) - damp * s.vel[i][1]) * dt;
        s.pos[i][0] += s.vel[i][0] * dt;
        s.pos[i][1] += s.vel[i][1] * dt;
      }
      setFrame((f) => (f + 1) % 1e6);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [geo, inView]);

  const pick = (i: number) => {
    phaseRef.current = i;
    setPhase(i);
    setAuto(false);
    if (state.current) state.current.phaseT = 0;
  };

  if (!mol || !geo || !state.current) {
    return <div ref={ref} className="aspect-[600/430] w-full animate-pulse rounded-2xl bg-zinc-900" />;
  }
  const s = state.current;
  const pos = s.pos;
  const key = PHASES[phase].key;
  const isTree = key === "tree";
  const isDecode = key === "decode";
  const showComm = key === "coarsen";

  // Tape progress: written during the tree phase, regenerated during decode.
  let tapeUpto = 0;
  if (isTree) tapeUpto = Math.floor(Math.min(1, s.phaseT / (PHASES[2].dur * 0.85)) * geo.tape.length);
  if (isDecode) tapeUpto = Math.floor(Math.min(1, s.phaseT / (PHASES[3].dur * GEN_FRAC)) * geo.tape.length);
  const generating = isDecode && tapeUpto < geo.tape.length;
  const emittedAtoms = new Set<number>();
  for (let i = 0; i < tapeUpto; i++) if (geo.tape[i].k === "atom") emittedAtoms.add(geo.tape[i].n);
  const emittedBonds = new Set(emittedEdges(geo.tape, tapeUpto, false).map(([u, v]) => edgeKey(u, v)));
  const treeAlpha = isTree ? Math.min(1, s.phaseT / 0.6) : 0;
  const decodeDone = isDecode && !generating;

  return (
    <div ref={ref} className="relative w-full select-none">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {PHASES.map((p, i) => (
          <button
            key={p.key}
            onClick={() => pick(i)}
            className={`relative overflow-hidden rounded-full px-3 py-1 text-xs transition ${i === phase ? "bg-white text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
          >
            {i === phase && auto && <span className="absolute inset-y-0 left-0 bg-sky-200/70" style={{ width: `${Math.min(100, (s.phaseT / p.dur) * 100)}%` }} />}
            <span className="relative">{i + 1}. {p.label}</span>
          </button>
        ))}
        {!auto && (
          <button onClick={() => setAuto(true)} className="ml-1 rounded-full px-2 py-1 text-xs text-sky-300 hover:underline">
            ▶ autoplay
          </button>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-2xl bg-zinc-900/60 ring-1 ring-white/10">
        <defs>
          <radialGradient id="hero-glow" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#hero-glow)" />

        {/* community islands: follow the atoms while coarsening */}
        {showComm &&
          geo.groups.map((g, i) =>
            g.length > 1 ? (
              <path key={i} d={blobPath(g.map((v) => pos[v]), 17)} fill={geo.commColor[i]} fillOpacity={Math.min(0.2, s.phaseT * 0.3)} stroke={geo.commColor[i]} strokeOpacity={Math.min(0.75, s.phaseT)} strokeWidth={1.3} />
            ) : null,
          )}
        {/* decoded communities: shaded at their final place once [EXIT] closes them */}
        {isDecode &&
          geo.groups.map((g, i) => {
            if (g.length < 2 || geo.closeTok[i] < 0 || tapeUpto <= geo.closeTok[i]) return null;
            const age = (tapeUpto - geo.closeTok[i]) / 12;
            return <path key={i} d={geo.molBlobs[i]} fill={geo.commColor[i]} fillOpacity={Math.min(0.2, age * 0.2)} stroke={geo.commColor[i]} strokeOpacity={Math.min(0.75, age)} strokeWidth={1.3} />;
          })}

        {/* partition tree skeleton */}
        {isTree && (
          <g opacity={treeAlpha}>
            {geo.commPos.map((cp, i) => (
              <line key={`r${i}`} x1={geo.root[0]} y1={geo.root[1]} x2={cp[0]} y2={cp[1]} stroke="#71717a" strokeWidth={1} />
            ))}
            {pos.map((p, v) => (
              <line key={`l${v}`} x1={geo.commPos[geo.commOf[v]][0]} y1={geo.commPos[geo.commOf[v]][1]} x2={p[0]} y2={p[1]} stroke="#52525b" strokeWidth={0.7} />
            ))}
            <circle cx={geo.root[0]} cy={geo.root[1]} r={13} fill={NAVY} stroke="#e4e4e7" strokeWidth={1.2} />
            <text x={geo.root[0]} y={geo.root[1] + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill="#fff">R</text>
            {geo.commPos.map((cp, i) => (
              <g key={`c${i}`}>
                <circle cx={cp[0]} cy={cp[1]} r={geo.groups[i].length > 1 ? 12 : 6} fill={geo.commColor[i]} stroke="#fff" strokeWidth={1} />
                {geo.groups[i].length > 1 && <text x={cp[0]} y={cp[1] + 3.5} fontSize={9.5} fontWeight={700} textAnchor="middle" fill="#fff">C{i}</text>}
              </g>
            ))}
          </g>
        )}

        {/* bonds */}
        {mol.bonds.map(([u, v, o], i) => {
          const [x1, y1] = pos[u];
          const [x2, y2] = pos[v];
          if (isTree) {
            const done = emittedAtoms.has(u) && emittedAtoms.has(v);
            const depth = 12 + Math.abs(x2 - x1) * 0.22;
            return <path key={i} d={`M${x1},${y1 + 6} Q${(x1 + x2) / 2},${Math.max(y1, y2) + depth * 2} ${x2},${y2 + 6}`} fill="none" stroke={EDGE_ORANGE} strokeWidth={1.3} opacity={done ? 0.9 : 0.08 * treeAlpha} />;
          }
          if (isDecode && !emittedBonds.has(edgeKey(u, v))) return null;
          const commsOn = showComm || decodeDone;
          const cross = commsOn && geo.commOf[u] !== geo.commOf[v];
          // A bond written by one of the last few back-edge tokens flashes orange.
          let hot = false;
          if (generating) {
            for (let j = tapeUpto - 1; j >= 0 && j >= tapeUpto - 4; j--) {
              const t = geo.tape[j];
              if (t.k === "tgt" && (t.n === u || t.n === v)) hot = true;
            }
          }
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={hot ? EDGE_ORANGE : cross ? "#a1a1aa" : "#d4d4d8"} strokeWidth={hot ? 2.6 : o > 1 ? 3.2 : 1.8} strokeDasharray={cross ? "3 3" : undefined} strokeLinecap="round" opacity={0.85} />
          );
        })}

        {/* atoms */}
        {pos.map(([x, y], i) => {
          if (!s.born[i]) return null;
          const el = mol.atoms[i];
          const colored = showComm || isDecode;
          const fill = colored ? geo.color[i] : ELEMENT_COLORS[el] === "#3f3f46" ? "#a1a1aa" : ELEMENT_COLORS[el];
          const dim = isTree && !emittedAtoms.has(i) ? 0.35 : 1;
          return (
            <g key={i} opacity={dim}>
              <circle cx={x} cy={y} r={isTree ? 6.2 : 8.5} fill={fill} stroke="#18181b" strokeWidth={1.2} />
              {!isTree && el !== "C" && <text x={x} y={y + 3.3} fontSize={9} fontWeight={700} textAnchor="middle" fill="#fff">{el}</text>}
            </g>
          );
        })}

        {/* token tape */}
        {(isTree || isDecode) && (
          <g transform={`translate(${TAPE_X},${TAPE_Y})`}>
            <text x={0} y={-8} fontSize={10} fill="#a1a1aa" letterSpacing={0.6}>
              {isTree ? "HDT TOKENS, WRITTEN FROM ℋ" : generating ? "SAMPLED BY THE CAUSAL TRANSFORMER, ONE TOKEN AT A TIME" : "DECODED: THE SAME GRAPH"}
            </text>
            {geo.tape.slice(0, tapeUpto).map((t, i) => {
              const c = geo.chips[i];
              const st = tokenStyle(t, (_c, n) => geo.color[n]);
              return (
                <g key={i}>
                  <rect x={c.x} y={c.y} width={c.w} height={11} rx={2} fill={st.bg === NAVY ? "#334155" : st.bg} />
                  <text x={c.x + c.w / 2} y={c.y + 8.3} fontSize={8.5} fontFamily="ui-monospace, monospace" textAnchor="middle" fill={st.fg}>{t.s}</text>
                </g>
              );
            })}
            {generating && tapeUpto < geo.chips.length && (
              <rect x={geo.chips[tapeUpto].x} y={geo.chips[tapeUpto].y} width={6} height={11} fill="#e4e4e7" opacity={Math.floor(s.t * 3) % 2 ? 0.9 : 0.2} />
            )}
          </g>
        )}
      </svg>
      <p className="mt-2 min-h-[2.5rem] text-center text-sm text-zinc-300">{PHASES[phase].text}</p>
    </div>
  );
}
