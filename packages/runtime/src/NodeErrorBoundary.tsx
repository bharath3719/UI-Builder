/**
 * One boundary per node — §13's "wrap each node in an error boundary".
 *
 * Expression failures never get here: the evaluator reports them and yields `undefined`,
 * so a half-typed binding leaves the node rendering with that prop unset. What does get
 * here is a component that threw on what an expression produced — an object bound to
 * something that indexes it, a value a component's own code cannot survive. Without a
 * boundary that unmounts the whole canvas, and the author's only clue is a blank page.
 *
 * It renders no element of its own, so a page that is working looks exactly as it would
 * without it — the failure case is the only case with markup.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { NODE_ID_ATTRIBUTE } from './attributes.js';

interface Props {
  children: ReactNode;
  /** Shown while editing; the preview and the export render nothing instead. */
  editing: boolean;
  nodeId: string;
  nodeName: string;
  className: string;
  /**
   * The node itself. Ops are pure and share every node they do not touch (D11), so a new
   * object here means *this* node was edited — which is the moment to try again.
   *
   * A failure caused by data rather than by the document therefore stays until the next
   * edit. That is the deliberate half of the trade: retrying on every render would spin,
   * since the render is what throws.
   */
  resetKey: unknown;
}

interface State {
  key: unknown;
  message: string | null;
}

export class NodeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { key: props.resetKey, message: null };
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey === state.key) return null;
    return { key: props.resetKey, message: null };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.warn(
      `[ui-builder] ${this.props.nodeName} failed to render:`,
      error,
      info.componentStack,
    );
  }

  override render(): ReactNode {
    const { message } = this.state;
    if (message === null) return this.props.children;
    if (!this.props.editing) return null;

    return (
      <div
        className={this.props.className}
        // Still selectable: the node that failed is the one someone has to open the
        // inspector on to fix, and a fallback without this would be unreachable.
        {...{ [NODE_ID_ATTRIBUTE]: this.props.nodeId }}
        style={{
          padding: '8px 12px',
          border: '1px dashed hsl(0 72% 51%)',
          borderRadius: 4,
          color: 'hsl(0 72% 51%)',
          font: '12px ui-monospace, monospace',
        }}
      >
        {this.props.nodeName} failed: {message}
      </div>
    );
  }
}
