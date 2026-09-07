import { Fragment, type ReactNode } from 'react';
import {
  blockTag,
  inlineTag,
  parseRichText,
  type RichBlock,
  type RichInline,
} from '../markdown.js';
import { asString } from '../spec.js';
import { RICH_TEXT_DEFAULT_CONTENT } from '../specs/RichText.js';
import type { RenderedProps } from './props.js';

export interface RichTextProps extends RenderedProps {
  content?: string;
}

function renderInline(nodes: RichInline[]): ReactNode {
  return nodes.map((node, index) => {
    if (node.kind === 'text') return <Fragment key={index}>{node.text}</Fragment>;
    if (node.kind === 'code') return <code key={index}>{node.text}</code>;
    if (node.kind === 'link') {
      return (
        <a key={index} href={node.href}>
          {renderInline(node.children)}
        </a>
      );
    }
    const Tag = inlineTag(node) as 'strong' | 'em';
    return <Tag key={index}>{renderInline(node.children)}</Tag>;
  });
}

function renderBlock(block: RichBlock, key: number): ReactNode {
  if (block.kind === 'rule') return <hr key={key} />;

  if (block.kind === 'code') {
    return (
      <pre key={key}>
        <code>{block.text}</code>
      </pre>
    );
  }

  if (block.kind === 'list') {
    const List = block.ordered ? 'ol' : 'ul';
    return (
      <List key={key}>
        {block.items.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </List>
    );
  }

  const Tag = blockTag(block) as 'p' | 'blockquote' | 'h1';
  return <Tag key={key}>{renderInline(block.children)}</Tag>;
}

/**
 * A block of formatted copy, authored as Markdown.
 *
 * Markdown rather than a WYSIWYG surface, and that is a decision about *this* phase
 * rather than a verdict on rich editing. What a page needs is the component: a run of
 * headings, paragraphs, lists and links that lays out on the canvas, styles from the
 * theme, and exports as static JSX. A toolbar over `contenteditable` is a second thing
 * entirely — a selection model that has to work across the canvas iframe — and it can be
 * built later against exactly this prop, because the content already lives in a string
 * rather than in child nodes. `Select`'s options and `ChatMessage`'s body took the same
 * route for the same reason.
 *
 * Nothing here uses `dangerouslySetInnerHTML`. `parseRichText` returns a tree and both
 * this and the code generator build real elements from it, so author text can never
 * become markup, and the exported page ships no Markdown parser.
 */
export function RichText({ content, className, children: _children, ...rest }: RichTextProps) {
  const blocks = parseRichText(asString(content, RICH_TEXT_DEFAULT_CONTENT));

  return (
    <div className={['ub-rich-text', className].filter(Boolean).join(' ')} {...rest}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}
