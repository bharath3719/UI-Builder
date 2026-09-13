import { asBoolean, asString } from '../spec.js';
import type { RenderedProps } from './props.js';

export interface CodeBlockProps extends RenderedProps {
  code?: string;
  language?: string;
  filename?: string;
  wrap?: boolean;
}

/**
 * A block of code with a filename and a language.
 *
 * No highlighting, deliberately (see the spec): what this draws is the frame around a
 * snippet, which is the part a design tool can be honest about. The code is a prop rather
 * than children for `ChatMessage`'s reason — a snippet is pasted, not assembled — and
 * `white-space` on the `<pre>` is what makes the canvas show the indentation that arrived
 * with it.
 */
export function CodeBlock({
  code,
  language,
  filename,
  className,
  children: _children,
  wrap,
  ...rest
}: CodeBlockProps) {
  const name = asString(filename);
  const lang = asString(language);

  return (
    <div
      className={['ub-code-block', className].filter(Boolean).join(' ')}
      data-wrap={asBoolean(wrap) ? '' : undefined}
      {...rest}
    >
      {name === '' && lang === '' ? null : (
        <div className="ub-code-block-header">
          {name === '' ? null : <span className="ub-code-block-name">{name}</span>}
          {lang === '' ? null : <span className="ub-code-block-language">{lang}</span>}
        </div>
      )}
      <pre className="ub-code-block-pre">
        <code className="ub-code-block-code">{asString(code)}</code>
      </pre>
    </div>
  );
}
