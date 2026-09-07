/**
 * The theme space steps a `gap` prop may name.
 *
 * `Stack` and `Grid` offer the same list and always have; it lives here rather than
 * being declared twice so that adding a step to the scale reaches both. A gap names a
 * step rather than a pixel value, so retuning the space scale retunes every layout
 * built on it.
 */
export const GAP_STEPS = ['0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16'] as const;
