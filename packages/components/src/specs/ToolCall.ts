import type { ComponentSpec } from '../spec.js';

/** What a call can be showing: still going, finished, or failed. */
export const TOOL_STATUSES = ['running', 'success', 'error'] as const;

/**
 * One tool an assistant reached for, shown the way a transcript shows it.
 *
 * A `<details>`, like `Accordion` and for the same reason: the arguments and the result are
 * the part a reader opens when they want it, and a disclosure is a browser feature rather
 * than a component with state. So the exported page expands with no JavaScript, and the
 * canvas gets the same markup frozen (`interactive`) because the click that opens it is
 * the click that selects the node.
 *
 * `status` moves the dot, the word beside the name and the border together — one dropdown
 * rather than three declarations, which is `ChatMessage`'s argument for `role` applied to
 * the other half of an agent transcript.
 */
export const ToolCallSpec: ComponentSpec = {
  key: 'ToolCall',
  displayName: 'Tool Call',
  category: 'AI',
  icon: 'Wrench',
  keywords: ['tool', 'call', 'function', 'agent', 'action', 'invoke', 'api', 'trace', 'ai'],
  description: 'A tool an assistant called, with its arguments and result.',

  props: [
    { name: 'name', label: 'Tool', type: 'string', placeholder: 'search_docs' },
    {
      name: 'status',
      label: 'Status',
      type: 'enum',
      options: TOOL_STATUSES.map((value) => ({ label: value, value })),
    },
    { name: 'arguments', label: 'Arguments', type: 'text', placeholder: '{ "query": "pricing" }' },
    { name: 'result', label: 'Result', type: 'text', placeholder: 'What came back' },
    { name: 'open', label: 'Expanded', type: 'boolean' },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,
  interactive: true,

  defaultProps: {
    name: 'search_docs',
    status: 'success',
    arguments: '{ "query": "refund policy", "limit": 3 }',
    result: '3 matches in Billing, Refunds, Terms',
    open: false,
  },
  defaultStyles: {},

  codegen: {
    tag: 'details',
    emit: {
      tag: 'details',
      class: 'ub-tool-call',
      attrs: {
        'data-status': { prop: 'status', as: 'enum', options: TOOL_STATUSES, fallback: 'success' },
        open: { prop: 'open', as: 'boolean' },
      },
      children: [
        {
          tag: 'summary',
          class: 'ub-tool-call-summary',
          children: [
            { tag: 'span', class: 'ub-tool-call-dot', attrs: { 'aria-hidden': 'true' } },
            {
              tag: 'span',
              class: 'ub-tool-call-name',
              children: [{ text: { prop: 'name', as: 'string', orElse: 'tool' } }],
            },
            {
              tag: 'span',
              class: 'ub-tool-call-state',
              children: [
                {
                  text: { prop: 'status', as: 'enum', options: TOOL_STATUSES, fallback: 'success' },
                },
              ],
            },
          ],
        },
        {
          tag: 'div',
          class: 'ub-tool-call-body',
          children: [
            {
              when: { prop: 'arguments', when: 'set' },
              tag: 'div',
              class: 'ub-tool-call-section',
              children: [
                {
                  tag: 'span',
                  class: 'ub-tool-call-label',
                  children: [{ text: 'Arguments' }],
                },
                {
                  tag: 'pre',
                  class: 'ub-tool-call-code',
                  children: [{ text: { prop: 'arguments', as: 'string' } }],
                },
              ],
            },
            {
              when: { prop: 'result', when: 'set' },
              tag: 'div',
              class: 'ub-tool-call-section',
              children: [
                { tag: 'span', class: 'ub-tool-call-label', children: [{ text: 'Result' }] },
                {
                  tag: 'pre',
                  class: 'ub-tool-call-code',
                  children: [{ text: { prop: 'result', as: 'string' } }],
                },
              ],
            },
          ],
        },
      ],
    },
  },
};
