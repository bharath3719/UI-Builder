import { describe, expect, it } from 'vitest';
import { makeNode, type StyleSet } from './doc.js';
import { activeBreakpoints, hasOwnDecls, ownDecls, resolveDecl, resolveDecls } from './cascade.js';
import { serializeStatePreview } from './style.js';
import { DEFAULT_THEME } from './theme.js';

const node = (styles: StyleSet) => makeNode({ id: 'n1', type: 'Box', name: 'Box', styles });

describe('activeBreakpoints', () => {
  it('is base alone at base', () => {
    expect(activeBreakpoints(DEFAULT_THEME, 'base')).toEqual(['base']);
  });

  it('includes every narrower breakpoint, narrowest first', () => {
    expect(activeBreakpoints(DEFAULT_THEME, 'lg')).toEqual(['base', 'sm', 'md', 'lg']);
  });

  it('degrades a breakpoint the theme no longer defines to base', () => {
    // A document can outlive the theme that produced it; the panel must still open.
    expect(activeBreakpoints(DEFAULT_THEME, 'gone')).toEqual(['base']);
  });
});

describe('resolveDecl', () => {
  const cell = { breakpoint: 'base' as const, state: 'default' as const };

  it('reports nothing set as none', () => {
    expect(resolveDecl(node({}), DEFAULT_THEME, cell, 'color')).toEqual({
      value: undefined,
      origin: 'none',
    });
  });

  it('reports a value written in the edited cell as own', () => {
    const resolved = resolveDecl(
      node({ base: { default: { color: 'red' } } }),
      DEFAULT_THEME,
      cell,
      'color',
    );
    expect(resolved).toMatchObject({ value: 'red', origin: 'own', breakpoint: 'base' });
  });

  it('reports a value from a narrower breakpoint as inherited', () => {
    const resolved = resolveDecl(
      node({ base: { default: { color: 'red' } } }),
      DEFAULT_THEME,
      { breakpoint: 'md', state: 'default' },
      'color',
    );
    expect(resolved).toMatchObject({ value: 'red', origin: 'inherited', breakpoint: 'base' });
  });

  it('lets a wider breakpoint win over a narrower one', () => {
    const styled = node({
      base: { default: { color: 'red' } },
      md: { default: { color: 'blue' } },
    });
    expect(
      resolveDecl(styled, DEFAULT_THEME, { breakpoint: 'lg', state: 'default' }, 'color'),
    ).toMatchObject({
      value: 'blue',
      origin: 'inherited',
      breakpoint: 'md',
    });
  });

  it('does not see a wider breakpoint from a narrower one', () => {
    const styled = node({ md: { default: { color: 'blue' } } });
    expect(
      resolveDecl(styled, DEFAULT_THEME, { breakpoint: 'base', state: 'default' }, 'color'),
    ).toEqual({
      value: undefined,
      origin: 'none',
    });
  });

  it('inherits the default state into a pseudo-state', () => {
    const styled = node({ base: { default: { color: 'red' } } });
    expect(
      resolveDecl(styled, DEFAULT_THEME, { breakpoint: 'base', state: 'hover' }, 'color'),
    ).toMatchObject({
      value: 'red',
      origin: 'inherited',
      state: 'default',
    });
  });

  it('lets the pseudo-state win over the default it inherits from', () => {
    const styled = node({ base: { default: { color: 'red' }, hover: { color: 'green' } } });
    expect(
      resolveDecl(styled, DEFAULT_THEME, { breakpoint: 'base', state: 'hover' }, 'color'),
    ).toMatchObject({
      value: 'green',
      origin: 'own',
      state: 'hover',
    });
  });

  it('does not leak a pseudo-state back into the default', () => {
    const styled = node({ base: { hover: { color: 'green' } } });
    expect(resolveDecl(styled, DEFAULT_THEME, cell, 'color')).toEqual({
      value: undefined,
      origin: 'none',
    });
  });
});

describe('resolveDecls', () => {
  it('composes every applicable cell, later writes winning', () => {
    const styled = node({
      base: { default: { color: 'red', padding: 4 } },
      md: { default: { color: 'blue' }, hover: { color: 'green' } },
    });

    expect(resolveDecls(styled, DEFAULT_THEME, { breakpoint: 'md', state: 'hover' })).toEqual({
      color: 'green',
      padding: 4,
    });
  });
});

describe('ownDecls / hasOwnDecls', () => {
  const styled = node({ base: { default: { color: 'red' } }, md: { default: { padding: 8 } } });

  it('returns only what the cell itself holds', () => {
    expect(ownDecls(styled, { breakpoint: 'md', state: 'default' })).toEqual({ padding: 8 });
  });

  it('answers per property list, so a section dot means its own section', () => {
    const cell = { breakpoint: 'base' as const, state: 'default' as const };
    expect(hasOwnDecls(styled, cell, ['color', 'fontSize'])).toBe(true);
    expect(hasOwnDecls(styled, cell, ['padding', 'margin'])).toBe(false);
  });
});

describe('serializeStatePreview', () => {
  it('emits nothing for the default state', () => {
    const styled = node({ base: { default: { color: 'red' }, hover: { color: 'green' } } });
    expect(
      serializeStatePreview(styled, DEFAULT_THEME, { breakpoint: 'base', state: 'default' }),
    ).toBe('');
  });

  it('doubles the class so it outranks the plain rule without !important', () => {
    const styled = node({ base: { default: { color: 'red' }, hover: { color: 'green' } } });
    const css = serializeStatePreview(styled, DEFAULT_THEME, {
      breakpoint: 'base',
      state: 'hover',
    });

    expect(css).toContain('.ub-n-n1.ub-n-n1 {');
    expect(css).toContain('color: green;');
    expect(css).not.toContain('!important');
  });

  it('carries the inherited declarations through, not just the state cell', () => {
    // Previewing hover must not drop the padding the default state set, or the node
    // would jump around on the canvas the moment the switcher moved.
    const styled = node({ base: { default: { padding: 8 }, hover: { color: 'green' } } });
    const css = serializeStatePreview(styled, DEFAULT_THEME, {
      breakpoint: 'base',
      state: 'hover',
    });

    expect(css).toContain('padding: 8px;');
    expect(css).toContain('color: green;');
  });

  it('emits nothing when the state has nothing to show', () => {
    expect(
      serializeStatePreview(node({}), DEFAULT_THEME, { breakpoint: 'base', state: 'hover' }),
    ).toBe('');
  });
});
