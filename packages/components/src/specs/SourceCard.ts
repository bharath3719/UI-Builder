import type { ComponentSpec } from '../spec.js';

/**
 * One retrieved source, as the card under an answer.
 *
 * `Citation`'s block-level twin: the same fact — this came from somewhere — given room for
 * the title, where it came from and the line that was matched. The whole card is the link,
 * so the target is the card's area rather than four words inside it, which is what a reader
 * on a phone is actually aiming at.
 *
 * `source` is typed rather than derived from the URL. Pulling `anthropic.com` out of an
 * href is a parse that has to live in the component *and* in `codegen` to keep D6, and it
 * would be wrong for exactly the cases a designer cares about — an internal wiki, a PDF, a
 * document with no URL at all.
 */
export const SourceCardSpec: ComponentSpec = {
  key: 'SourceCard',
  displayName: 'Source Card',
  category: 'AI',
  icon: 'Globe',
  keywords: ['source', 'result', 'citation', 'reference', 'search', 'retrieval', 'card', 'ai'],
  description: 'A retrieved source, with where it came from and what it said.',

  props: [
    { name: 'index', label: 'Number', type: 'number' },
    { name: 'source', label: 'From', type: 'string', placeholder: 'docs.example.com' },
    { name: 'title', label: 'Title', type: 'string', placeholder: 'How refunds work' },
    { name: 'snippet', label: 'Snippet', type: 'text', placeholder: 'The line that matched' },
    { name: 'href', label: 'Link', type: 'url', placeholder: 'https://example.com/refunds' },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: {
    index: 1,
    source: 'docs.example.com',
    title: 'How refunds work',
    snippet: 'Refunds are issued to the original payment method within five business days.',
    href: '',
  },
  defaultStyles: {},

  codegen: {
    tag: 'a',
    emit: {
      tag: 'a',
      class: 'ub-source-card',
      attrs: {
        href: { when: { prop: 'href', when: 'set' }, value: { prop: 'href', as: 'string' } },
      },
      children: [
        {
          tag: 'span',
          class: 'ub-source-card-head',
          children: [
            {
              tag: 'span',
              class: 'ub-source-card-index',
              children: [{ text: { prop: 'index', as: 'number', fallback: 1, min: 1 } }],
            },
            {
              when: { prop: 'source', when: 'set' },
              tag: 'span',
              class: 'ub-source-card-source',
              children: [{ text: { prop: 'source', as: 'string' } }],
            },
          ],
        },
        {
          when: { prop: 'title', when: 'set' },
          tag: 'span',
          class: 'ub-source-card-title',
          children: [{ text: { prop: 'title', as: 'string' } }],
        },
        {
          when: { prop: 'snippet', when: 'set' },
          tag: 'span',
          class: 'ub-source-card-snippet',
          children: [{ text: { prop: 'snippet', as: 'string' } }],
        },
      ],
    },
  },
};
