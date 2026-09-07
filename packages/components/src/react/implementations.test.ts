import { describe, expect, it } from 'vitest';
import { SPECS } from '../registry.js';
import { SYMBOL_ICON } from '../symbols.js';
import { COMPONENTS, ICONS, SYMBOL_ICON_COMPONENT } from './implementations.js';

/**
 * The seam between the two halves of the package.
 *
 * A spec is data and names its component and its icon by string, which is what keeps
 * React and lucide out of every bundle that only reads the library. The cost of that is
 * that nothing type-checks the join, so it is asserted here instead: a spec with no
 * component is a palette entry that draws a red "unknown component" box the moment it is
 * dropped, and one with no icon is a palette row with a blank square in it.
 */
describe('every spec has an implementation', () => {
  it.each(SPECS.map((spec) => spec.key))('%s renders as a component', (key) => {
    expect(COMPONENTS[key]).toBeTypeOf('function');
  });

  it.each(SPECS.map((spec) => [spec.key, spec.icon]))('%s names a real icon (%s)', (_key, icon) => {
    expect(ICONS[icon]).toBeDefined();
  });

  // The other direction: a component left behind by a deleted spec is dead weight the
  // studio can never reach, and a spare icon is a lucide import nothing renders.
  it('carries nothing the registry does not list', () => {
    const keys = new Set(SPECS.map((spec) => spec.key));
    expect(Object.keys(COMPONENTS).filter((key) => !keys.has(key))).toEqual([]);

    // A symbol's spec is derived rather than registered, so its icon is named by
    // `symbolSpec` and not by anything in `SPECS`.
    const named = new Set([...SPECS.map((spec) => spec.icon), SYMBOL_ICON]);
    expect(Object.keys(ICONS).filter((name) => !named.has(name))).toEqual([]);
  });

  // The two halves of the symbol icon, joined the way the surfaces that draw a *node*
  // rather than a spec reach for it — `ICON_BY_KEY` cannot hold it, because a symbol's key
  // carries an id this package has no way to know.
  it('resolves the symbol icon by name and as a constant', () => {
    expect(ICONS[SYMBOL_ICON]).toBe(SYMBOL_ICON_COMPONENT);
  });
});
