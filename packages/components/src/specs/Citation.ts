import type { ComponentSpec } from '../spec.js';

/**
 * A numbered reference to a source, inline in the copy.
 *
 * An anchor whichever way it is used: with a link it goes somewhere, and without one it
 * is still the element a reader recognises. That is why there is no second, span-shaped
 * branch — an `<a>` with no `href` is valid, unfocusable and styled the same, so the
 * markup does not fork on whether the author has the URL yet.
 *
 * It sits inline (`display: inline-flex`, baseline-aligned) because a citation belongs
 * *in* a sentence. The chip a search result gets is `SourceCard`, which is the same fact
 * given a whole block to itself.
 */
export const CitationSpec: ComponentSpec = {
  key: 'Citation',
  displayName: 'Citation',
  category: 'AI',
  icon: 'Quote',
  keywords: ['citation', 'cite', 'source', 'reference', 'footnote', 'link', 'evidence', 'ai'],
  description: 'A numbered reference to a source, inline in the text.',

  props: [
    { name: 'index', label: 'Number', type: 'number' },
    { name: 'label', label: 'Label', type: 'string', placeholder: 'Pricing guide' },
    { name: 'href', label: 'Link', type: 'url', placeholder: 'https://example.com/pricing' },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: {
    index: 1,
    label: 'Pricing guide',
    href: '',
  },
  defaultStyles: {},

  codegen: {
    tag: 'a',
    emit: {
      tag: 'a',
      class: 'ub-citation',
      attrs: {
        href: { when: { prop: 'href', when: 'set' }, value: { prop: 'href', as: 'string' } },
      },
      children: [
        {
          tag: 'span',
          class: 'ub-citation-index',
          // Never zero and never a fraction: a citation is the nth source, and a
          // reference numbered 0 reads as a bug in whatever produced the page.
          children: [{ text: { prop: 'index', as: 'number', fallback: 1, min: 1 } }],
        },
        {
          when: { prop: 'label', when: 'set' },
          tag: 'span',
          class: 'ub-citation-label',
          children: [{ text: { prop: 'label', as: 'string' } }],
        },
      ],
    },
  },
};
