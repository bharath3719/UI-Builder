import type { ComponentSpec } from '../spec.js';

export const RICH_TEXT_DEFAULT_CONTENT = [
  '## A rich text block',
  '',
  'Write **Markdown** here and it renders as real headings, lists and [links](/about).',
  '',
  '- Authored as text',
  '- Exported as static JSX',
].join('\n');

export const RichTextSpec: ComponentSpec = {
  key: 'RichText',
  displayName: 'Rich Text',
  category: 'Basic',
  icon: 'LetterText',
  keywords: ['rich', 'text', 'markdown', 'prose', 'article', 'content', 'body', 'wysiwyg', 'copy'],
  description: 'Formatted copy — headings, lists and links — written in Markdown.',

  props: [{ name: 'content', label: 'Content', type: 'text', placeholder: '# Markdown' }],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { content: RICH_TEXT_DEFAULT_CONTENT },
  defaultStyles: {},

  codegen: {
    tag: 'div',
    emit: {
      tag: 'div',
      class: 'ub-rich-text',
      // `fallback`, not `orElse`: clearing the field means an empty block, and the export
      // has to agree with the canvas about that. Text is the same way.
      children: [{ markdown: { prop: 'content', fallback: RICH_TEXT_DEFAULT_CONTENT } }],
    },
  },
};
