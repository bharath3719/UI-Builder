/**
 * The left panel's views, as data.
 *
 * Apart from `Rail.tsx` so that file exports only its component — a module that mixes
 * components and constants loses fast refresh for everything in it, and the layout
 * reads the labels too.
 *
 * `library` is the component *library* — the palette you insert from — and `components`
 * is the document's own reusable ones (§12). The names were the other way round before
 * symbols existed; they were swapped rather than qualified, because "Components" in a
 * builder means the ones you built.
 */

export const RAIL_VIEWS = ['pages', 'components', 'library', 'layers', 'data'] as const;

export type RailView = (typeof RAIL_VIEWS)[number];

/** Title-cased for the panel header; the rail itself shows icons and a tooltip. */
export const RAIL_LABELS: Record<RailView, string> = {
  pages: 'Pages',
  components: 'Components',
  library: 'Insert',
  layers: 'Layers',
  data: 'Data',
};
