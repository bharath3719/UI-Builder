/**
 * Device presets — PLAN.md §12, Phase 9.
 *
 * A preset is a *viewport*, not a scale: the frame is given the width and height, and the
 * design inside lays itself out at that size with its media queries resolving against it.
 * Nothing is transformed, so what is on screen is the page at that width rather than a
 * picture of it — which is the only version of this that can be judged.
 *
 * The widths are the conventional CSS breakpoints for each class of device rather than any
 * specific handset's, because that is what a stylesheet is written against. `fit` is the
 * responsive case and the default: most of the time the question is "does this work at the
 * size I have", and only sometimes "does this work at 375".
 */
export interface DevicePreset {
  id: string;
  label: string;
  /** `null` fills the available area — the design reflows with the window. */
  width: number | null;
  height: number | null;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  { id: 'fit', label: 'Fit window', width: null, height: null },
  { id: 'mobile', label: 'Mobile', width: 375, height: 667 },
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024 },
  { id: 'laptop', label: 'Laptop', width: 1280, height: 800 },
];

export const DEFAULT_DEVICE = DEVICE_PRESETS[0] as DevicePreset;

export function deviceById(id: string): DevicePreset {
  return DEVICE_PRESETS.find((preset) => preset.id === id) ?? DEFAULT_DEVICE;
}
