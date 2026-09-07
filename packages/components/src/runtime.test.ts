/**
 * The runtime modules are the one place this library writes a component twice — once as
 * React for the canvas, once as a string for the export — and D6 says the two renderings
 * of a node agree. Two copies that agree today are two copies that can stop agreeing, and
 * nothing else in the build would notice, so this is the thing that notices.
 *
 * Everything from the first import down has to match exactly. The file-level comment above
 * it is allowed to differ, and does: the copy in `react/` explains itself to someone
 * reading this repo, and the copy shipped in an export explains itself to someone who has
 * only ever seen their own project.
 */

import { describe, expect, it } from 'vitest';
import sortableRowsSource from './react/SortableRows.tsx?raw';
import { SORTABLE_ROWS } from './runtime.js';

/** Everything after the file-level comment — the part the two copies share. */
function body(source: string): string {
  const start = source.indexOf('\nimport ');
  expect(start, 'no import to anchor on').toBeGreaterThan(-1);
  // Line endings are the working copy's business, not the comparison's.
  return source.slice(start + 1).replace(/\r\n/g, '\n');
}

const MODULES = [{ module: SORTABLE_ROWS, twin: sortableRowsSource }];

describe('exported runtime modules', () => {
  it.each(MODULES)('$module.name is its React twin, from the first import down', (entry) => {
    expect(body(entry.module.source)).toBe(body(entry.twin));
  });

  it.each(MODULES)('$module.name survives the literal it is stored in', (entry) => {
    // The source lives in a template literal in `runtime.ts`. A backtick would end it and
    // a dollar-brace would start an interpolation, and both are syntax errors reported a
    // long way from the character that caused them.
    expect(entry.module.source).not.toContain('`');
    expect(entry.module.source).not.toContain('${');
  });

  it.each(MODULES)('$module.name lands where its import specifier points', (entry) => {
    // A page is `src/pages/<Name>.tsx`, so its specifier resolves against `src/pages/`.
    const resolved = new URL(entry.module.specifier, 'file:///src/pages/').pathname.slice(1);
    expect(`${resolved}.tsx`).toBe(entry.module.path);
  });
});
