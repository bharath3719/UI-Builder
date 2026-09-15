/**
 * The last stop. Anything a render throws lands here instead of unmounting the app.
 *
 * Without one, a single bad node — a component reading a prop that a migration did not
 * quite fill in, an expression that returns something the renderer does not expect — takes
 * React's root down and leaves a blank white page. Blank is the worst possible answer:
 * there is nothing to report, nothing to retry, and no way to tell it apart from a page
 * that never loaded.
 *
 * A class because there is still no hook for this — `componentDidCatch` is the only way to
 * catch a descendant's render error.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button.js';
import { ScreenMessage } from './Screen.js';

interface Props {
  children: ReactNode;
  /**
   * What the user was looking at, for the heading — "the studio", "this page". A boundary
   * that says which part broke is the difference between "try again" and "reload
   * everything", and the caller is the only one that knows.
   */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The component stack is the genuinely useful half and it is not on the error, so this
    // is the only place it can be recorded.
    console.error('Unhandled render error', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <ScreenMessage
        title="Something went wrong"
        message={
          `An unexpected problem stopped ${this.props.label ?? 'the studio'} from rendering. ` +
          'Your saved work is not affected.'
        }
        actions={
          <>
            {/*
              Clearing the error re-renders the same subtree, which is worth offering first:
              a failure that came from a transient state — a half-applied edit, a query
              result that arrived in an unexpected shape — is gone by the time the user
              presses it, and a reload would cost them everything unsaved for no reason.
            */}
            <Button onClick={() => this.setState({ error: null })}>Try again</Button>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </>
        }
      />
    );
  }
}
