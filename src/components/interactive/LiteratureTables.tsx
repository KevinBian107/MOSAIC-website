import { useState } from "react";
import { Pills } from "./TokenTape";

/** Paper Table 4: placement within the graph-generation literature (∗ = transcribed as published). */
const TABLES: Record<string, { cols: string[]; rows: string[][] }> = {
  MOSES: {
    cols: ["Model", "Valid ↑", "Unique ↑", "Novel ↑", "Filters ↑", "FCD ↓", "SNN ↑"],
    rows: [
      ["VAE - SMILES∗", "97.7", "99.8", "69.5", "99.7", "0.57", "0.58"],
      ["JT-VAE - FRAGMENTS∗", "100.0", "100.0", "99.9", "97.8", "1.00", "0.53"],
      ["GraphINVENT∗", "96.4", "99.8", "n/a", "95.0", "1.22", "0.54"],
      ["DiGress∗", "85.7", "100.0", "95.0", "97.1", "1.19", "0.52"],
      ["SENT (GPT2-s)∗", "87.4", "100.0", "85.9", "98.6", "0.91", "0.55"],
      ["SENT (GPT2-xs)", "97.7", "100.0", "99.0", "94.2", "0.70", "0.506"],
      ["HDT-HAC-R (GPT2-xs)", "97.8", "99.9", "95.0", "98.1", "0.25", "0.583"],
      ["HDT-HAC-FR (GPT2-xs)", "98.5", "100.0", "97.1", "97.5", "0.26", "0.560"],
    ],
  },
  GuacaMol: {
    cols: ["Model", "Valid ↑", "Unique ↑", "Novel ↑", "KL Div ↑", "FCD ↓"],
    rows: [
      ["LSTM - SMILES∗", "95.9", "100.0", "91.2", "99.1", "0.46"],
      ["NAGVAE∗", "92.7", "95.5", "100.0", "38.4", "23.55"],
      ["MCTS∗", "100.0", "100.0", "99.4", "52.2", "21.00"],
      ["DiGress∗", "85.2", "100.0", "99.9", "92.9", "1.93"],
      ["SENT (GPT2-s)∗", "91.6", "100.0", "97.7", "97.5", "1.17"],
      ["SENT (GPT2-xs)", "96.7", "100.0", "99.8", "93.8", "1.80"],
      ["HDT-HAC-R (GPT2-xs)", "94.3", "100.0", "98.7", "98.1", "0.87"],
      ["HDT-HAC-FR (GPT2-xs)", "96.6", "100.0", "99.6", "96.3", "0.99"],
    ],
  },
  Proteins: {
    cols: ["Model", "Deg ↓", "Clus ↓", "Orbit ↓", "Spec ↓", "Ratio ↓"],
    rows: [
      ["Training set", "0.0003", "0.0068", "0.0032", "0.0005", "1.00"],
      ["GraphRNN∗", "0.0040", "0.1475", "0.5851", "0.0152", "62.10"],
      ["GRAN∗", "0.0479", "0.1234", "0.3458", "0.0125", "77.70"],
      ["SPECTRE∗", "0.0056", "0.0843", "0.0267", "0.0052", "12.50"],
      ["EDGE∗", "0.1863", "0.3406", "0.6786", "0.1075", "274.50"],
      ["GraphGen∗", "0.0159", "0.1677", "0.3789", "0.0181", "58.10"],
      ["BiGG∗", "0.0070", "0.1150", "0.4696", "0.0067", "50.10"],
      ["DiGress∗", "0.0041", "0.0489", "0.1286", "0.0018", "16.20"],
      ["GruM∗", "0.0019", "0.0660", "0.0345", "0.0030", "8.20"],
      ["GEEL∗", "0.2110", "0.3753", "0.1768", "0.1689", "287.90"],
      ["ESGG∗", "0.0030", "0.0309", "0.0047", "0.0013", "4.70"],
      ["SENT (GPT2-s)∗", "0.0004", "0.0244", "0.0056", "0.0013", "2.30"],
      ["SENT (GPT2-xs)", "0.0039", "0.0820", "0.0278", "0.0047", "10.72"],
      ["HDT-HAC-R (GPT2-xs)", "0.0003", "0.0128", "0.0060", "0.0007", "1.57"],
    ],
  },
};

export default function LiteratureTables() {
  const [t, setT] = useState("MOSES");
  const tab = TABLES[t];
  return (
    <div className="not-prose rounded-2xl border border-zinc-200 bg-white p-3 sm:p-5">
      <div className="mb-3">
        <Pills small value={t} onChange={setT} options={Object.keys(TABLES).map((k) => [k, k] as [string, string])} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-y-2 border-zinc-800">
              {tab.cols.map((c) => (
                <th key={c} className="px-2 py-1.5 text-right font-semibold whitespace-nowrap text-zinc-800 first:text-left">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tab.rows.map((r, i) => {
              const ours = String(r[0]).startsWith("HDT");
              const ctrl = String(r[0]).includes("(GPT2-xs)") && !ours;
              return (
                <tr key={i} className={`${ours ? "bg-blue-50/70 font-medium" : ""} ${ctrl ? "border-t border-zinc-300" : ""} ${String(r[0]) === "Training set" ? "text-zinc-400" : ""}`}>
                  {r.map((c, j) => (
                    <td key={j} className="px-2 py-1 text-right whitespace-nowrap tabular-nums first:text-left">{c}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-800"><td colSpan={tab.cols.length} /></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
