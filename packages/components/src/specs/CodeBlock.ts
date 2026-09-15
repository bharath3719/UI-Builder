import type { EmitCondition } from '../emit.js';
import type { ComponentSpec } from '../spec.js';

const HAS_HEADER: EmitCondition = {
  any: [
    { prop: 'filename', when: 'set' },
    { prop: 'language', when: 'set' },
  ],
};

/**
 * A block of code, as an assistant would show one.
 *
 * There is no syntax highlighting and that is a decision, not a gap: highlighting means
 * shipping a tokenizer and a theme into every exported project, and a grammar this library
 * would then own the version of. What a page like this needs is the *frame* — a mono
 * surface, a filename, the language, a scroll that does not push the column wider — and
 * the frame is what a design tool can honestly draw.
 *
 * The code is a `text` prop rather than children, `ChatMessage`'s reason exactly: a snippet
 * is something someone pastes, not a subtree they assemble. `white-space: pre` on the
 * element is what makes the canvas show the indentation that was pasted, and `codegen`
 * writes it as a string expression rather than JSX text (`ir.ts`), so the export keeps
 * every space of it.
 */
export const CodeBlockSpec: ComponentSpec = {
  key: 'CodeBlock',
  displayName: 'Code Block',
  category: 'AI',
  icon: 'Code',
  keywords: ['code', 'snippet', 'block', 'pre', 'syntax', 'mono', 'terminal', 'sample'],
  description: 'A block of code with a filename and a language.',

  props: [
    { name: 'code', label: 'Code', type: 'text', placeholder: 'Paste the snippet' },
    { name: 'language', label: 'Language', type: 'string', placeholder: 'tsx' },
    { name: 'filename', label: 'Filename', type: 'string', placeholder: 'App.tsx' },
    { name: 'wrap', label: 'Wrap long lines', type: 'boolean' },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: {
    code: 'export function greet(name: string) {\n  return `Hello, ${name}`;\n}',
    language: 'tsx',
    filename: '',
    wrap: false,
  },
  defaultStyles: {},

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      class: 'ub-code-block',
      attrs: { 'data-wrap': { prop: 'wrap', as: 'flag', on: '' } },
      children: [
        {
          when: HAS_HEADER,
          tag: 'div',
          class: 'ub-code-block-header',
          children: [
            {
              when: { prop: 'filename', when: 'set' },
              tag: 'span',
              class: 'ub-code-block-name',
              children: [{ text: { prop: 'filename', as: 'string' } }],
            },
            {
              when: { prop: 'language', when: 'set' },
              tag: 'span',
              class: 'ub-code-block-language',
              children: [{ text: { prop: 'language', as: 'string' } }],
            },
          ],
        },
        {
          tag: 'pre',
          class: 'ub-code-block-pre',
          children: [
            {
              tag: 'code',
              class: 'ub-code-block-code',
              children: [{ text: { prop: 'code', as: 'string' } }],
            },
          ],
        },
      ],
    },
  },
};
