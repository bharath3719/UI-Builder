import { describe, expect, it } from 'vitest';
import { classifyLink } from './links.js';

describe('classifyLink', () => {
  it('reads a site path as a page, normalised the way the document stores one', () => {
    expect(classifyLink('/about')).toEqual({ kind: 'page', path: '/about' });
    expect(classifyLink('/about/')).toEqual({ kind: 'page', path: '/about' });
    expect(classifyLink('  /about  ')).toEqual({ kind: 'page', path: '/about' });
    // A nav item written without the slash means the same page to whoever typed it.
    expect(classifyLink('about')).toEqual({ kind: 'page', path: '/about' });
    expect(classifyLink('/')).toEqual({ kind: 'page', path: '/' });
  });

  it('drops a query or hash — a page path is the whole address the document knows', () => {
    expect(classifyLink('/about?ref=nav')).toEqual({ kind: 'page', path: '/about' });
    expect(classifyLink('/about#team')).toEqual({ kind: 'page', path: '/about' });
  });

  it('treats anything with a scheme, and a protocol-relative URL, as leaving the design', () => {
    expect(classifyLink('https://example.com/x')).toEqual({
      kind: 'external',
      href: 'https://example.com/x',
    });
    expect(classifyLink('mailto:hi@example.com')).toEqual({
      kind: 'external',
      href: 'mailto:hi@example.com',
    });
    expect(classifyLink('//example.com')).toEqual({ kind: 'external', href: '//example.com' });
  });

  it('reads a fragment as a place in this page', () => {
    expect(classifyLink('#pricing')).toEqual({ kind: 'fragment', id: 'pricing' });
    expect(classifyLink('#top%20of%20page')).toEqual({ kind: 'fragment', id: 'top of page' });
  });

  it('points a half-configured link nowhere', () => {
    // '#' is what `Link` emits when no href has been set — the common case, not an odd one.
    expect(classifyLink('#')).toEqual({ kind: 'none' });
    expect(classifyLink('')).toEqual({ kind: 'none' });
    expect(classifyLink('   ')).toEqual({ kind: 'none' });
    expect(classifyLink(null)).toEqual({ kind: 'none' });
    expect(classifyLink(undefined)).toEqual({ kind: 'none' });
  });
});
