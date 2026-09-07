import { describe, expect, it } from 'vitest';
import { makeNode, type StyleSet } from './doc.js';
import { kebabCase, nodeClassName, serializeNodeStyles, serializeTheme } from './style.js';
import { DEFAULT_THEME } from './theme.js';

const serialize = (styles: StyleSet) =>
  serializeNodeStyles(makeNode({ id: 'n1', type: 'Box', name: 'Box', styles }), DEFAULT_THEME).css;

describe('kebabCase', () => {
  it('converts camelCase properties', () => {
    expect(kebabCase('paddingTop')).toBe('padding-top');
    expect(kebabCase('color')).toBe('color');
    expect(kebabCase('gridTemplateColumns')).toBe('grid-template-columns');
  });

  it('restores the leading dash on vendor prefixes', () => {
    expect(kebabCase('WebkitLineClamp')).toBe('-webkit-line-clamp');
    expect(kebabCase('MozOsxFontSmoothing')).toBe('-moz-osx-font-smoothing');
  });
});

describe('serializeNodeStyles', () => {
  it('names the class after the node id', () => {
    expect(nodeClassName('n1')).toBe('ub-n-n1');
    expect(serialize({ base: { default: { color: 'red' } } })).toContain('.ub-n-n1 {');
  });

  it('appends px to numbers, except where the property is unitless', () => {
    const css = serialize({
      base: { default: { padding: 8, lineHeight: 1.5, zIndex: 3, opacity: 0.5, margin: 0 } },
    });
    expect(css).toContain('padding: 8px;');
    expect(css).toContain('line-height: 1.5;');
    expect(css).toContain('z-index: 3;');
    expect(css).toContain('opacity: 0.5;');
    // Zero needs no unit, and reads better without one in the exported stylesheet.
    expect(css).toContain('margin: 0;');
  });

  it('emits states after default so they win on source order', () => {
    const css = serialize({
      base: { hover: { color: 'blue' }, default: { color: 'red' } },
    });
    expect(css.indexOf('color: red')).toBeLessThan(css.indexOf('color: blue'));
    expect(css).toContain('.ub-n-n1:hover {');
  });

  it('maps focus to :focus-visible and disabled to both forms', () => {
    expect(serialize({ base: { focus: { outline: 'none' } } })).toContain(
      '.ub-n-n1:focus-visible {',
    );

    const disabled = serialize({ base: { disabled: { opacity: 0.5 } } });
    expect(disabled).toContain('.ub-n-n1:disabled,');
    expect(disabled).toContain('.ub-n-n1[data-disabled] {');
  });

  it('wraps non-base breakpoints in ascending min-width queries', () => {
    const css = serialize({
      lg: { default: { padding: 32 } },
      md: { default: { padding: 24 } },
      base: { default: { padding: 16 } },
    });

    expect(css.indexOf('padding: 16px')).toBeLessThan(css.indexOf('@media (min-width: 768px)'));
    expect(css.indexOf('@media (min-width: 768px)')).toBeLessThan(
      css.indexOf('@media (min-width: 1024px)'),
    );
  });

  it('ignores a breakpoint the theme does not declare', () => {
    expect(serialize({ nonsense: { default: { padding: 4 } } })).toBe('');
  });

  describe('upTo', () => {
    const styles: StyleSet = {
      base: { default: { padding: 16 } },
      md: { default: { padding: 24 } },
      lg: { default: { padding: 32 } },
    };

    const serializeUpTo = (upTo: string) =>
      serializeNodeStyles(makeNode({ id: 'n1', type: 'Box', name: 'Box', styles }), DEFAULT_THEME, {
        upTo,
      }).css;

    it('drops every breakpoint wider than the one being edited', () => {
      const css = serializeUpTo('md');
      expect(css).toContain('@media (min-width: 768px)');
      expect(css).not.toContain('@media (min-width: 1024px)');
    });

    it('keeps base alone at base', () => {
      const css = serializeUpTo('base');
      expect(css).toContain('padding: 16px;');
      expect(css).not.toContain('@media');
    });

    it('keeps the media queries, so a rule below the artboard width stays dormant', () => {
      // The cap narrows what is emitted; it never makes a rule apply at a width the
      // real page would not apply it at.
      expect(serializeUpTo('lg')).toContain('@media (min-width: 1024px)');
    });

    it('caps at base for a breakpoint the theme no longer declares', () => {
      expect(serializeUpTo('gone')).not.toContain('@media');
    });

    it('is the whole stylesheet when unset — preview and codegen are unaffected', () => {
      expect(serialize(styles)).toContain('@media (min-width: 1024px)');
    });
  });

  it('produces nothing for an empty style set', () => {
    expect(serialize({})).toBe('');
    expect(serialize({ base: { default: {} } })).toBe('');
  });

  // The output is injected into a <style> tag in the canvas iframe, so a value must
  // not be able to close its own rule — or the element. What survives sanitising may
  // be nonsense CSS the browser drops; what matters is that it stays one rule.
  it('cannot open a second rule out of a declaration value', () => {
    const css = serialize({
      base: { default: { color: 'red } .evil { display: none' } },
    });
    expect(css.match(/\{/g)).toHaveLength(1);
    expect(css.match(/\}/g)).toHaveLength(1);
  });

  it('cannot close the style element out of a declaration value', () => {
    const css = serialize({ base: { default: { content: '"</style><script>alert(1)"' } } });
    expect(css).not.toContain('</style>');
    expect(css).not.toContain('<script');
  });

  it('drops a property name that is not a valid CSS identifier', () => {
    expect(serialize({ base: { default: { 'color: red; background': 'blue' } } })).toBe('');
  });
});

describe('serializeTheme', () => {
  it('emits colours unprefixed and other scales namespaced', () => {
    const css = serializeTheme(DEFAULT_THEME);
    expect(css).toContain('--primary: hsl(222 47% 11%);');
    expect(css).toContain('--muted-foreground: hsl(215 16% 47%);');
    expect(css).toContain('--space-4: 16px;');
    expect(css).toContain('--radius-md: 8px;');
    expect(css).toContain('--font-sans:');
  });
});
