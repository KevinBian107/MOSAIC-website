# Beyond Flat Walks — project page

Project page for *Beyond Flat Walks: Compositional Abstraction for Autoregressive Graph Generation* (NeurIPS 2026), deployed to <https://kbian.org/MOSAIC-website/>.

The page walks through the paper with interactive figures instead of re-hosting it. Every animation is driven by real coarsener / tokenizer output exported from the [MOSAIC](https://github.com/KevinBian107/MOSAIC) code base; result numbers are transcribed from the camera-ready paper.

## Layout

| Path | What it is |
|------|------------|
| `src/pages/index.astro` | Hero (title, authors, links, abstract, hero animation) and table of contents |
| `src/content.mdx` | Narrative and figure placement |
| `src/components/interactive/` | React figures: `HeroGravity`, `FlatVsHier`, `PipelineExplorer`, `CoarseningExplorer`, `RandomizationExplorer`, `ResultsChart`, `GraphZoo`, `SbmAlignment`, `LiteratureTables`, `GenerationGallery` |
| `src/components/interactive/shared.ts` | Data loading, palettes, geometry helpers |
| `public/gallery/` | Generation-gallery cells (paper Appendix A.19) cut from the camera-ready PDF by `scripts/website/extract_gallery_cells.py`; shown by `GenerationGallery.tsx` |
| `public/data/{molecules,graphs}.json` | Exported tokenizations, partition trees and graphs (fetched lazily) |

## Regenerating the data

From the MOSAIC repository root, in the `mosaic` conda env:

```bash
python scripts/website/export_website_data.py --out-dir MOSAIC-website/public/data
```

This runs the HDT / SENT / HSENT / HDTC tokenizers and the HAC / Motif Community coarseners on the paper's molecules (camptothecin, the Figure 2 COCONUT sample, cholesterol, …), resamples -R / -FR traversals, and exports one graph per non-molecular benchmark.

## Development

```bash
npm install
npm run dev      # http://localhost:4321/MOSAIC-website/
npm run build    # static site in dist/
```

Pushing to `main` deploys via `.github/workflows/astro.yml`. Built with [Roman Hauksson-Neill's project page template](https://research-template.roman.technology).
