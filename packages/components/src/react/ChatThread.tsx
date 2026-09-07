import { asBoolean } from '../spec.js';
import type { RenderedProps } from './props.js';

export interface ChatThreadProps extends RenderedProps {
  bordered?: boolean;
}

/**
 * The column a conversation is laid out in.
 *
 * A `VStack` would render the same box, and that is the point of having this instead:
 * a thread is the one container in an AI layout whose children are all `ChatMessage`s,
 * so it carries the gap and the alignment that spacing looks right at without the user
 * setting them, and it names itself in the layers panel as what it is. Alignment is
 * `stretch` rather than `start` because a user message right-aligns itself from inside
 * its own bubble — the row has to be full width for that to have anywhere to go.
 *
 * `bordered` is the same call `Card.elevated` makes: a thread is usually a bare column
 * on the page, and sometimes a panel. One boolean rather than four declarations.
 */
export function ChatThread({ bordered, className, children, ...rest }: ChatThreadProps) {
  return (
    <div
      className={['ub-chat-thread', className].filter(Boolean).join(' ')}
      data-bordered={asBoolean(bordered) ? 'true' : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}
