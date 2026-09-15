import type { MouseEvent } from 'react';
import { asBoolean, asEnum, asString } from '../spec.js';
import { TOOL_STATUSES } from '../specs/ToolCall.js';
import type { RenderedProps } from './props.js';

export interface ToolCallProps extends RenderedProps {
  name?: string;
  status?: string;
  arguments?: string;
  result?: string;
  open?: boolean;
  /** Supplied by the renderer while editing — see `Accordion`, which does the same. */
  readOnly?: boolean;
}

/**
 * One tool an assistant called, with its arguments and its result.
 *
 * A `<details>`, so the exported transcript expands with no JavaScript; frozen on the
 * canvas, so the click that would open it selects the node instead. `status` moves the
 * dot, the word and the border at once — `ChatMessage`'s argument for `role`, applied to
 * the other half of an agent transcript.
 */
export function ToolCall({
  name,
  status,
  arguments: args,
  result,
  open,
  className,
  children: _children,
  readOnly,
  ...rest
}: ToolCallProps) {
  const state = asEnum(status, TOOL_STATUSES, 'success');
  const input = asString(args);
  const output = asString(result);

  const freeze = readOnly
    ? (event: MouseEvent) => {
        event.preventDefault();
      }
    : undefined;

  return (
    <details
      className={['ub-tool-call', className].filter(Boolean).join(' ')}
      data-status={state}
      open={asBoolean(open)}
      {...rest}
    >
      <summary className="ub-tool-call-summary" onClick={freeze}>
        <span className="ub-tool-call-dot" aria-hidden="true" />
        <span className="ub-tool-call-name">{asString(name) || 'tool'}</span>
        <span className="ub-tool-call-state">{state}</span>
      </summary>
      <div className="ub-tool-call-body">
        {input === '' ? null : (
          <div className="ub-tool-call-section">
            <span className="ub-tool-call-label">Arguments</span>
            <pre className="ub-tool-call-code">{input}</pre>
          </div>
        )}
        {output === '' ? null : (
          <div className="ub-tool-call-section">
            <span className="ub-tool-call-label">Result</span>
            <pre className="ub-tool-call-code">{output}</pre>
          </div>
        )}
      </div>
    </details>
  );
}
