import { useEffect, useMemo, useRef, useState } from "react";
import { Pills } from "./TokenTape";
import { COMMUNITY_PALETTE, useGraphs, useInView, type GraphRec } from "./shared";

/**
 * "Beyond molecules": one graph per non-molecular benchmark, laid out by a
 * live force simulation. The gravity slider adds an attraction of every node
 * toward the centroid of its community (and pushes community centroids
 * apart), so a hierarchy that matches the data collapses into clean islands
 * while one that does not leaves tangled, overlapping clouds.
 */
interface Verdict {
  tone: "good" | "mixed" | "bad";
  head: string;
  lines: string[];
}
const VERDICTS: Record<string, Verdict> = {
  proteins: {
    tone: "good",
    head: "Hierarchy helps",
    lines: [
      "V.U.N. 0.540 (SENT) → 0.879 (HDT-HAC-R, +62.8%) → 0.960 (HDT-HAC-FR)",
      "MMD Ratio 10.72 → 1.57; Degree MMD 0.0003, equal to the training-sample reference",
      "No chemical catalogue needed: HAC finds the units",
    ],
  },
  ssbm: {
    tone: "good",
    head: "Hierarchy helps",
    lines: ["V.U.N. +59.3% for HDT-HAC-R over SENT", "Degree MMD, Orbit MMD and Ratio reduced by more than 90%", "Small, sparse communities suit the molecularly tuned τ = 4"],
  },
  sbm: {
    tone: "mixed",
    head: "Only with an aligned hierarchy",
    lines: ["Default HAC over-refines ~31-node blocks into ~2-node leaves", "HDT-HAC-R V.U.N. 0.276 vs SENT 0.669 (it memorizes)", "Raising τ to 44: 0.709; planted hierarchy: 0.887"],
  },
  rsbm: {
    tone: "mixed",
    head: "Only with an aligned hierarchy",
    lines: ["Connected RSBM, R = 4: SENT V.U.N.† 0.373", "HAC (τ = 10) -R 0.854, close to planted PH-R 0.858", "But HAC-FR collapses to 0.083 vs PH-FR 0.744"],
  },
  planar: {
    tone: "bad",
    head: "No hierarchy to find",
    lines: ["Planar graphs have no community structure; HAC still cuts them, but many edges cross the cuts", "Both hierarchical configurations are worse than SENT on every graph MMD", "The coarsening must be assessed per domain"],
  },
};
const TONE = { good: "bg-emerald-50 text-emerald-800 ring-emerald-200", mixed: "bg-amber-50 text-amber-800 ring-amber-200", bad: "bg-rose-50 text-rose-800 ring-rose-200" };

function groupsOf(g: GraphRec, color: "hac" | "planted" | "none"): number[] {
  const out = new Array(g.n).fill(0);
  if (color === "none") return out;
  if (color === "planted" && g.planted) {
    const flat = (g.planted as unknown[]).flatMap((b) => (Array.isArray((b as unknown[])[0]) ? (b as number[][]) : [b as number[]]));
    // For RSBM color by coarse block: first level of the nesting.
    if (Array.isArray((g.planted as unknown[][])[0]?.[0])) {
      (g.planted as number[][][]).forEach((coarse, i) => coarse.flat().forEach((v) => (out[v] = i)));
    } else flat.forEach((b, i) => b.forEach((v) => (out[v] = i)));
    return out;
  }
  const tree = g.trees.hac4;
  (tree.ch ?? [tree]).forEach((c, i) => c.n.forEach((v) => (out[v] = i)));
  return out;
}

const W = 640;
const H = 440;

export default function GraphZoo({ base }: { base: string }) {
  const graphs = useGraphs(base);
  const [key, setKey] = useState("proteins");
  const [gravity, setGravity] = useState(0.55);
  const [colorBy, setColorBy] = useState<"hac" | "planted" | "none">("hac");
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap);
  const sim = useRef<{ x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array; drag: number; alpha: number; cam: { s: number; ox: number; oy: number } } | null>(null);
  const gravRef = useRef(gravity);
  gravRef.current = gravity;

  const g = graphs?.find((x) => x.key === key);
  const groups = useMemo(() => (g ? groupsOf(g, colorBy === "none" ? "hac" : colorBy) : []), [g, colorBy]);
  const k = groups.length ? Math.max(...groups) + 1 : 0;

  useEffect(() => {
    if (!g) return;
    const n = g.n;
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    g.xy.forEach(([a, b], i) => {
      x[i] = W / 2 + a * (W * 0.42);
      y[i] = H / 2 + b * (H * 0.42);
    });
    sim.current = { x, y, vx: new Float32Array(n), vy: new Float32Array(n), drag: -1, alpha: 1, cam: { s: 1, ox: 0, oy: 0 } };
  }, [g]);

  // Reheat the simulation whenever the forces change.
  useEffect(() => {
    if (sim.current) sim.current.alpha = Math.max(sim.current.alpha, 0.6);
  }, [gravity, colorBy]);

  useEffect(() => {
    if (!g || !inView) return;
    const ctx = canvas.current!.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    canvas.current!.width = W * dpr;
    canvas.current!.height = H * dpr;
    ctx.scale(dpr, dpr);
    const n = g.n;
    const deg = new Array(n).fill(0);
    g.edges.forEach(([u, v]) => {
      deg[u]++;
      deg[v]++;
    });
    const rest = Math.max(10, Math.min(26, 260 / Math.sqrt(n)));
    let id = 0;
    const cxs = new Float32Array(k);
    const cys = new Float32Array(k);
    const cnt = new Float32Array(k);
    // d3-force style: every force is scaled by alpha, which cools toward zero,
    // so the layout settles instead of oscillating; forces are per-node, so the
    // step stays stable as graphs grow.
    const charge = -3.2 * rest;
    const step = () => {
      const s = sim.current!;
      if (s.drag >= 0) s.alpha = Math.max(s.alpha, 0.3);
      const alpha = s.alpha;
      if (alpha < 0.002) return;
      const G = gravRef.current;
      const { x, y, vx, vy } = s;
      cxs.fill(0);
      cys.fill(0);
      cnt.fill(0);
      for (let i = 0; i < n; i++) {
        cxs[groups[i]] += x[i];
        cys[groups[i]] += y[i];
        cnt[groups[i]]++;
      }
      for (let c = 0; c < k; c++) {
        cxs[c] /= Math.max(1, cnt[c]);
        cys[c] /= Math.max(1, cnt[c]);
      }
      // many-body repulsion (cut off at 120px)
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          let dx = x[j] - x[i];
          let dy = y[j] - y[i];
          let d2 = dx * dx + dy * dy;
          if (d2 > 120 * 120) continue;
          if (d2 < 1) { dx = (Math.random() - 0.5) * 1e-2; dy = (Math.random() - 0.5) * 1e-2; d2 = 1; }
          const w = (charge * alpha) / d2;
          vx[i] += dx * w; vy[i] += dy * w;
          vx[j] -= dx * w; vy[j] -= dy * w;
        }
      // links: stronger inside a community, weaker across as gravity rises
      for (const [u, v] of g.edges) {
        const dx = x[v] + vx[v] - x[u] - vx[u];
        const dy = y[v] + vy[v] - y[u] - vy[u];
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const same = groups[u] === groups[v];
        const strength = (1 / Math.min(deg[u], deg[v])) * (same ? 1 : 1 - 0.92 * G);
        const len = same ? rest * (1 - 0.35 * G) : rest * (1 + 2 * G);
        const l = ((d - len) / d) * alpha * strength * 0.5;
        vx[u] += dx * l; vy[u] += dy * l;
        vx[v] -= dx * l; vy[v] -= dy * l;
      }
      // pull toward the community centroid, and a weak pull to the canvas center
      for (let i = 0; i < n; i++) {
        const c = groups[i];
        vx[i] += (cxs[c] - x[i]) * 0.12 * G * alpha + (W / 2 - x[i]) * 0.02 * alpha;
        vy[i] += (cys[c] - y[i]) * 0.12 * G * alpha + (H / 2 - y[i]) * 0.02 * alpha;
      }
      for (let i = 0; i < n; i++) {
        vx[i] *= 0.6;
        vy[i] *= 0.6;
        if (i === s.drag) { vx[i] = 0; vy[i] = 0; continue; }
        x[i] += vx[i];
        y[i] += vy[i];
      }
      s.alpha += (0 - alpha) * 0.0228;
    };
    const draw = () => {
      const s = sim.current!;
      // Camera: fit the current layout into the canvas, eased to avoid jumps.
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < n; i++) {
        if (s.x[i] < x0) x0 = s.x[i];
        if (s.x[i] > x1) x1 = s.x[i];
        if (s.y[i] < y0) y0 = s.y[i];
        if (s.y[i] > y1) y1 = s.y[i];
      }
      const pad = 18;
      const sc = Math.min((W - 2 * pad) / Math.max(1, x1 - x0), (H - 2 * pad) / Math.max(1, y1 - y0), 2);
      const tox = W / 2 - sc * (x0 + x1) / 2;
      const toy = H / 2 - sc * (y0 + y1) / 2;
      const cam = s.cam;
      if (s.drag < 0) {
        const e = cam.s === 1 && cam.ox === 0 ? 1 : 0.12;
        cam.s += (sc - cam.s) * e;
        cam.ox += (tox - cam.ox) * e;
        cam.oy += (toy - cam.oy) * e;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * cam.ox, dpr * cam.oy);
      const r = (n > 150 ? 3.6 : 4.6) / s.cam.s;
      ctx.lineWidth = 0.8 / s.cam.s;
      for (const [u, v] of g.edges) {
        const same = groups[u] === groups[v] || colorBy === "none";
        ctx.strokeStyle = same ? "rgba(82,82,91,0.35)" : "rgba(161,161,170,0.22)";
        ctx.beginPath();
        ctx.moveTo(s.x[u], s.y[u]);
        ctx.lineTo(s.x[v], s.y[v]);
        ctx.stroke();
      }
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = colorBy === "none" ? "#52525b" : COMMUNITY_PALETTE[groups[i] % COMMUNITY_PALETTE.length];
        ctx.beginPath();
        ctx.arc(s.x[i], s.y[i], r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 0.9 / s.cam.s;
        ctx.stroke();
      }
    };
    const loop = () => {
      step();
      step();
      draw();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [g, inView, groups, k, colorBy]);

  // Dragging
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const toLocal = (e: PointerEvent): [number, number] => {
      const r = c.getBoundingClientRect();
      const cam = sim.current?.cam ?? { s: 1, ox: 0, oy: 0 };
      const px = ((e.clientX - r.left) / r.width) * W;
      const py = ((e.clientY - r.top) / r.height) * H;
      return [(px - cam.ox) / cam.s, (py - cam.oy) / cam.s];
    };
    const down = (e: PointerEvent) => {
      const s = sim.current;
      if (!s) return;
      const [px, py] = toLocal(e);
      let best = -1;
      let bd = (15 / (s.cam.s || 1)) ** 2;
      for (let i = 0; i < s.x.length; i++) {
        const d = (s.x[i] - px) ** 2 + (s.y[i] - py) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      s.drag = best;
      if (best >= 0) c.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const s = sim.current;
      if (!s || s.drag < 0) return;
      const [px, py] = toLocal(e);
      s.x[s.drag] = px;
      s.y[s.drag] = py;
    };
    const up = () => sim.current && (sim.current.drag = -1);
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
    };
  }, [g]);

  const v = VERDICTS[key];
  const hacGroups = g ? groupsOf(g, "hac") : [];
  const crossPct = g ? Math.round((100 * g.edges.filter(([a, b]) => hacGroups[a] !== hacGroups[b]).length) / g.edges.length) : 0;
  return (
    <div ref={wrap} className="not-prose rounded-2xl border border-zinc-200 bg-white p-3 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Pills
          value={key}
          onChange={(k2) => { setKey(k2); if (k2 !== "sbm" && k2 !== "ssbm" && k2 !== "rsbm" && colorBy === "planted") setColorBy("hac"); }}
          options={[["proteins", "Proteins"], ["ssbm", "Sparse SBM"], ["sbm", "SBM"], ["rsbm", "Recursive SBM"], ["planar", "Planar"]]}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div>
          <canvas ref={canvas} className="aspect-[640/440] w-full cursor-grab touch-none rounded-xl bg-zinc-50" />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
            <span>community gravity</span>
            <input type="range" min={0} max={1} step={0.01} value={gravity} onChange={(e) => setGravity(+e.target.value)} className="h-1 w-40 accent-zinc-900" />
            <span className="font-mono tabular-nums">{gravity.toFixed(2)}</span>
            <span className="ml-auto">
              <Pills
                small
                value={colorBy}
                onChange={setColorBy}
                options={(g?.planted ? [["hac", "HAC communities"], ["planted", "planted blocks"], ["none", "no color"]] : [["hac", "HAC communities"], ["none", "no color"]]) as ["hac" | "planted" | "none", string][]}
              />
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className={`rounded-xl p-3 ring-1 ${TONE[v.tone]}`}>
            <div className="text-sm font-semibold">{v.head}</div>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] leading-snug">
              {v.lines.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
          {g && (
            <div className="text-[12px] leading-relaxed text-zinc-500">
              {g.name}: {g.n} nodes, {g.edges.length} edges, {(g.trees.hac4.ch ?? []).length} top-level HAC communities;{" "}
              <b className="text-zinc-700">{crossPct}%</b> of edges cross between them.{" "}
              {key === "proteins" ? "A held-out D&D graph." : key === "planar" ? "A held-out SPECTRE planar graph." : "Drawn from the benchmark's generator law (Table 16)."} Drag nodes to perturb the layout.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
