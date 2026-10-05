import { useEffect, useState } from "react";
import { Pills } from "./TokenTape";
import { asset } from "./shared";

/**
 * Unconditional generation galleries (paper Appendix A.19, Figures 7-15),
 * restricted to the held-out reference, SENT, HDT-HAC-R and HDT-HAC-FR rows.
 * Cells are cut from the camera-ready figures by
 * scripts/website/extract_gallery_cells.py; red-framed cells in the paper
 * (block-model samples failing the community-structure check) are flagged.
 */
interface Cell {
  src: string;
  failed: boolean;
}
interface Gallery {
  key: string;
  label: string;
  kind: "molecule" | "graph";
  figure: number;
  rows: { label: string; cells: Cell[] }[];
}

const ROW_STYLE: Record<string, { color: string; sub: string }> = {
  Reference: { color: "#a1a1aa", sub: "held-out evaluation arm" },
  SENT: { color: "#52525b", sub: "flat walk" },
  "HDT-HAC-R": { color: "#2563eb", sub: "ours · within-community" },
  "HDT-HAC-FR": { color: "#ea580c", sub: "ours · hierarchy-wide" },
};

// Headline numbers per dataset and model, from the paper (Table 3; Tables 14, 15, 19, 21).
const STATS: Record<string, Record<string, string>> = {
  guacamol: { SENT: "V.U.N. 0.965 · FCD 1.80", "HDT-HAC-R": "V.U.N. 0.931 · FCD 0.87", "HDT-HAC-FR": "V.U.N. 0.961 · FCD 0.99" },
  moses: { SENT: "V.U.N. 0.967 · FCD 0.70", "HDT-HAC-R": "V.U.N. 0.929 · FCD 0.25", "HDT-HAC-FR": "V.U.N. 0.956 · FCD 0.26" },
  coconut2: { SENT: "V.U.N. 0.912 · FCD 1.17", "HDT-HAC-R": "V.U.N. 0.757 · FCD 0.55", "HDT-HAC-FR": "V.U.N. 0.839 · FCD 0.56" },
  geom_drugs: { SENT: "V.U.N. 0.945 · FCD 2.74", "HDT-HAC-R": "V.U.N. 0.842 · FCD 1.20", "HDT-HAC-FR": "V.U.N. 0.945 · FCD 1.35" },
  macrocycle: { SENT: "V.U.N. 0.854 · FCD 2.71", "HDT-HAC-R": "V.U.N. 0.537 · FCD 1.06", "HDT-HAC-FR": "V.U.N. 0.762 · FCD 1.50" },
  proteins: { SENT: "V.U.N. 0.540", "HDT-HAC-R": "V.U.N. 0.879", "HDT-HAC-FR": "V.U.N. 0.960" },
  planar: { SENT: "V.U.N. 0.017", "HDT-HAC-R": "V.U.N. 0.000", "HDT-HAC-FR": "V.U.N. 0.000" },
  sbm: { SENT: "V.U.N. 0.669", "HDT-HAC-R": "V.U.N. 0.276", "HDT-HAC-FR": "V.U.N. 0.445" },
  ssbm: { SENT: "V.U.N. 0.527", "HDT-HAC-R": "V.U.N. 0.840", "HDT-HAC-FR": "V.U.N. 0.485" },
};

const NOTES: Record<string, string> = {
  molecule: "Molecular galleries show valid decoded molecules, so they illustrate chemical composition; how often decoding is valid is in the numbers beside each row.",
  planar: "Planar is the negative result: almost no generated graph passes the planar validity test for any model.",
  sbm: "Red frames mark generations that fail the frozen community-structure check. Default HDT-HAC-R passes it but repeats training graphs (see Figure 7).",
  ssbm: "Red frames mark generations that fail the frozen community-structure check.",
  proteins: "Protein graphs from the D&D benchmark (100–500 residues).",
};

let manifestPromise: Promise<Gallery[]> | null = null;

export default function GenerationGallery({ base }: { base: string }) {
  const [data, setData] = useState<Gallery[] | null>(null);
  const [key, setKey] = useState("coconut2");
  const [zoom, setZoom] = useState<{ cell: Cell; row: string } | null>(null);

  useEffect(() => {
    manifestPromise ??= fetch(asset(base, "gallery/manifest.json")).then((r) => r.json());
    manifestPromise.then(setData);
  }, [base]);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  if (!data) return <div className="h-[560px] animate-pulse rounded-2xl bg-zinc-100" />;
  const g = data.find((d) => d.key === key)!;
  const mols = data.filter((d) => d.kind === "molecule");
  const graphs = data.filter((d) => d.kind === "graph");
  const note = g.kind === "molecule" ? NOTES.molecule : NOTES[g.key];

  return (
    <div className="not-prose rounded-2xl border border-zinc-200 bg-white p-3 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] tracking-wide text-zinc-400 uppercase">molecules</span>
          <Pills small value={key} onChange={setKey} options={mols.map((d) => [d.key, d.label] as [string, string])} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] tracking-wide text-zinc-400 uppercase">graphs</span>
          <Pills small value={key} onChange={setKey} options={graphs.map((d) => [d.key, d.label] as [string, string])} />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {g.rows.map((row) => {
          const st = ROW_STYLE[row.label];
          const stat = STATS[g.key]?.[row.label];
          return (
            <div key={row.label} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <div className="flex flex-wrap items-baseline gap-x-2 sm:flex-col sm:items-start sm:gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-zinc-900">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: st.color }} />
                  {row.label}
                </span>
                <span className="text-[11px] text-zinc-500">{st.sub}</span>
                {stat && <span className="font-mono text-[10.5px] whitespace-nowrap text-zinc-600 tabular-nums">{stat}</span>}
              </div>
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {row.cells.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setZoom({ cell: c, row: row.label })}
                    className={`group relative aspect-square overflow-hidden rounded-xl border bg-white transition hover:z-10 hover:-translate-y-0.5 hover:shadow-lg ${
                      c.failed ? "border-rose-300 ring-2 ring-rose-500/70" : "border-zinc-200"
                    }`}
                    style={{ borderTop: `3px solid ${st.color}` }}
                    aria-label={`${row.label} sample ${i + 1}${c.failed ? " (fails validity check)" : ""}`}
                  >
                    <img src={asset(base, "gallery/" + c.src)} alt="" loading="lazy" className="h-full w-full object-contain p-1 transition group-hover:scale-[1.04]" />
                    {c.failed && (
                      <span className="absolute right-1 bottom-1 rounded bg-rose-600 px-1 py-px text-[9px] font-medium text-white">fails check</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-zinc-500">
        <b className="text-zinc-700">Paper Figure {g.figure}.</b> {note} Click a sample to enlarge.
      </p>

      {zoom && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm" onClick={() => setZoom(null)}>
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2 text-sm">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ROW_STYLE[zoom.row].color }} />
              <b className="text-zinc-900">{zoom.row}</b>
              <span className="text-zinc-500">· {g.label}</span>
              {zoom.cell.failed && <span className="rounded bg-rose-600 px-1.5 py-px text-[11px] text-white">fails community-structure check</span>}
              <button onClick={() => setZoom(null)} className="ml-auto rounded-full px-2 text-zinc-500 hover:bg-zinc-100" aria-label="Close">
                ✕
              </button>
            </div>
            <img src={asset(base, "gallery/" + zoom.cell.src)} alt={`${zoom.row} sample`} className="w-full rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
