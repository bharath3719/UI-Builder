/**
 * One render of every component in the library, with its own defaults and the props
 * the renderer adds — twice, because the renderer has two modes and they differ in
 * exactly the props a form control cares about.
 *
 * Cheap, and it catches the mistakes a new spec makes that nothing else here would: a
 * component that drops `className` (its styles would silently stop applying, since the
 * node's rules are written against that class) or `data-ub-*` (the canvas could not
 * hit-test it, so it would be unselectable); a controlled field without `readOnly` on
 * the canvas, which is a console warning rather than a failure and would therefore
 * ship; and — the shipped pass — a control still pinned `readOnly` in the preview and
 * the export, where it is supposed to work.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { COMPONENTS } from './react/implementations.js';
import { SPECS } from './registry.js';
import { isDesignTimeControl } from './spec.js';

/** The two ways `PageRenderer` mounts a component: `editing`, and not. */
const MODES = [
  { name: 'canvas', editing: true },
  { name: 'preview', editing: false },
];

describe('every spec renders', () => {
  it.each(MODES)('keeps the class and the hit-test attribute in the $name', ({ editing }) => {
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args);
    });

    try {
      for (const spec of SPECS) {
        const html = renderToStaticMarkup(
          createElement(COMPONENTS[spec.key]!, {
            ...spec.defaultProps,
            className: 'ub-n-test',
            'data-ub-id': 'test',
            ...(editing && isDesignTimeControl(spec) ? { readOnly: true } : {}),
          }),
        );
        expect(html, spec.key).not.toBe('');
        expect(html, spec.key).toContain('ub-n-test');
        expect(html, spec.key).toContain('data-ub-id="test"');

        // The preview and the export are the page as it ships. A control frozen there
        // is the bug this pass exists for: a `readOnly` date input will not open its
        // calendar, and a `readOnly` field cannot be typed into.
        if (!editing) expect(html, spec.key).not.toContain('readonly');
      }
    } finally {
      spy.mockRestore();
    }

    expect(errors).toEqual([]);
  });
});
