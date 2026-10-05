import { useState } from "react";
import { Pills } from "./TokenTape";

/**
 * Paper Table 3 / Figure 3: unconditional generation on the five molecular
 * benchmarks. Means over generation seeds 42-44, transcribed from the paper.
 */
const DATASETS = ["GuacaMol", "MOSES", "COCONUT 2.0", "GEOM-Drugs", "Macrocycle"];
const SERIES = [
  { key: "SENT", color: "#52525b", marker: "circle" },
  { key: "HDT-HAC-R", color: "#2563eb", marker: "square" },
  { key: "HDT-HAC-FR", color: "#ea580c", marker: "triangle" },
] as const;

type Metric = { key: string; label: string; up: boolean; vals: number[][]; fmt: number };
// vals[dataset][series]
const METRICS: Metric[] = [
  { key: "vun", label: "V.U.N.", up: true, fmt: 3, vals: [[0.965, 0.931, 0.961], [0.967, 0.929, 0.956], [0.912, 0.757, 0.839], [0.945, 0.842, 0.945], [0.854, 0.537, 0.762]] },
  { key: "fcd", label: "FCD", up: false, fmt: 3, vals: [[1.799, 0.871, 0.989], [0.696, 0.246, 0.26], [1.173, 0.551, 0.563], [2.742, 1.196, 1.353], [2.711, 1.064, 1.501]] },
  { key: "pgd", label: "MoleculePGD", up: false, fmt: 3, vals: [[0.309, 0.176, 0.196], [0.217, 0.13, 0.137], [0.386, 0.202, 0.212], [0.456, 0.3, 0.326], [0.639, 0.085, 0.204]] },
  { key: "snn", label: "SNN", up: true, fmt: 3, vals: [[0.41, 0.472, 0.445], [0.506, 0.583, 0.56], [0.385, 0.463, 0.428], [0.362, 0.43, 0.407], [0.352, 0.65, 0.522]] },
  { key: "scaff", label: "Scaffold sim.", up: true, fmt: 3, vals: [[0.89, 0.932, 0.925], [0.962, 0.981, 0.979], [0.861, 0.913, 0.906], [0.839, 0.863, 0.846], [0.035, 0.537, 0.368]] },
  { key: "val", label: "Validity", up: true, fmt: 3, vals: [[0.967, 0.943, 0.966], [0.977, 0.978, 0.985], [0.932, 0.86, 0.908], [0.949, 0.913, 0.957], [0.855, 0.819, 0.79]] },
  { key: "nov", label: "Novelty", up: true, fmt: 3, vals: [[0.998, 0.987, 0.996], [0.99, 0.95, 0.971], [0.979, 0.88, 0.924], [0.997, 0.925, 0.988], [0.999, 0.658, 0.967]] },
];

const W = 640;
const H = 300;
const PAD = { l: 48, r: 16, t: 18, b: 44 };

function Marker({ kind, x, y, c }: { kind: string; x: number; y: number; c: string }) {
  if (kind === "square") return <rect x={x - 5} y={y - 5} width={10} height={10} fill="#fff" stroke={c} strokeWidth={2} />;
  if (kind === "triangle") return <path d={`M${x},${y - 6} L${x + 6},${y + 5} L${x - 6},${y + 5}z`} fill="#fff" stroke={c} strokeWidth={2} />;
  return <circle cx={x} cy={y} r={5.2} fill="#fff" stroke={c} strokeWidth={2} />;
}

export default function ResultsChart() {
  const [mk, setMk] = useState("fcd");
  const [mode, setMode] = useState<"abs" | "rel">("abs");
  const [hover, setHover] = useState<number | null>(null);
  const m = METRICS.find((x) => x.key === mk)!;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const xOf = (d: number) => PAD.l + (iw * (d + 0.5)) / DATASETS.length;

  // Relative change vs SENT, signed so that positive is better.
  const rel = m.vals.map((row) => row.map((v) => (m.up ? (v - row[0]) / row[0] : (row[0] - v) / row[0]) * 100));

  let y0: number;
  let y1: number;
  if (mode === "abs") {
    const all = m.vals.flat();
    y0 = Math.min(0, Math.min(...all));
    y1 = Math.max(...all) * 1.08;
    if (m.up && Math.min(...all) > 0.3 && m.key !== "snn") y0 = Math.floor(Math.min(...all) * 10) / 10 - 0.05;
  } else {
    const all = rel.flat();
    y0 = Math.min(-5, Math.min(...all) * 1.1);
    y1 = Math.max(5, Math.max(...all) * 1.1);
  }
  // Round the axis to a "nice" step so tick labels read cleanly.
  const raw = (y1 - y0) / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const stepTick = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw)!;
  y0 = Math.floor(y0 / stepTick) * stepTick;
  y1 = Math.ceil(y1 / stepTick) * stepTick;
  const yOf = (v: number) => PAD.t + ih - ((v - y0) / (y1 - y0)) * ih;
  const ticks: number[] = [];
  for (let v = y0; v <= y1 + 1e-9; v += stepTick) ticks.push(v);
  const dec = stepTick >= 1 ? 0 : stepTick >= 0.1 ? 1 : 2;

  return (
    <div className="not-prose rounded-2xl border border-zinc-200 bg-white p-3 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Pills small value={mk} onChange={setMk} options={METRICS.map((x) => [x.key, `${x.label} ${x.up ? "↑" : "↓"}`] as [string, string])} />
        <Pills small value={mode} onChange={setMode} options={[["abs", "values"], ["rel", "change vs SENT"]]} />
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-zinc-600">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <svg width="14" height="14"><Marker kind={s.marker} x={7} y={7} c={s.color} /></svg>
            {s.key}
          </span>
        ))}
        <span className="text-zinc-400">{mode === "rel" ? "bars: % improvement over SENT (positive = better)" : m.up ? "higher is better" : "lower is better"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" onMouseLeave={() => setHover(null)}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="#f4f4f5" />
            <text x={PAD.l - 6} y={yOf(v) + 4} fontSize={10.5} textAnchor="end" fill="#a1a1aa">
              {mode === "rel" ? `${v.toFixed(0)}%` : v.toFixed(dec)}
            </text>
          </g>
        ))}
        {mode === "rel" && <line x1={PAD.l} x2={W - PAD.r} y1={yOf(0)} y2={yOf(0)} stroke="#71717a" />}
        {DATASETS.map((d, di) => (
          <g key={d} onMouseEnter={() => setHover(di)}>
            <rect x={xOf(di) - iw / DATASETS.length / 2} y={PAD.t} width={iw / DATASETS.length} height={ih} fill={hover === di ? "#fafafa" : "transparent"} />
            <text x={xOf(di)} y={H - PAD.b + 18} fontSize={12} textAnchor="middle" fill="#3f3f46">{d}</text>
          </g>
        ))}
        {mode === "abs" &&
          SERIES.map((s, si) => (
            <g key={s.key} style={{ pointerEvents: "none" }}>
              <polyline points={m.vals.map((row, di) => `${xOf(di)},${yOf(row[si])}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} opacity={0.85} />
              {m.vals.map((row, di) => <Marker key={di} kind={s.marker} x={xOf(di)} y={yOf(row[si])} c={s.color} />)}
            </g>
          ))}
        {mode === "rel" &&
          rel.map((row, di) =>
            [1, 2].map((si) => {
              const bw = 22;
              const x = xOf(di) + (si === 1 ? -bw - 2 : 2);
              const v = row[si];
              return (
                <g key={`${di}-${si}`} style={{ pointerEvents: "none" }}>
                  <rect x={x} y={Math.min(yOf(v), yOf(0))} width={bw} height={Math.abs(yOf(v) - yOf(0))} fill={SERIES[si].color} opacity={0.85} rx={2} />
                  <text x={x + bw / 2} y={v >= 0 ? yOf(v) - 4 : yOf(v) + 12} fontSize={10} textAnchor="middle" fill="#3f3f46">
                    {v > 0 ? "+" : ""}{v.toFixed(0)}
                  </text>
                </g>
              );
            }),
          )}
        {hover !== null && (
          <g style={{ pointerEvents: "none" }}>
            <rect x={Math.min(xOf(hover) + 30, W - 180)} y={PAD.t + 4} width={168} height={66} rx={6} fill="#18181b" opacity={0.92} />
            {SERIES.map((s, si) => (
              <text key={s.key} x={Math.min(xOf(hover) + 40, W - 170)} y={PAD.t + 24 + si * 18} fontSize={11.5} fill="#fff">
                <tspan fill={si === 0 ? "#d4d4d8" : s.color === "#2563eb" ? "#93c5fd" : "#fdba74"}>{s.key}</tspan>
                <tspan x={Math.min(xOf(hover) + 40, W - 170) + 88}>
                  {m.vals[hover][si].toFixed(m.fmt)}
                  {si > 0 ? ` (${rel[hover][si] > 0 ? "+" : ""}${rel[hover][si].toFixed(0)}%)` : ""}
                </tspan>
              </text>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
