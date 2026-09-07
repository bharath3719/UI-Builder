import { asBoolean, asEnum, asString } from '../spec.js';
import { CHAT_ROLES } from '../specs/ChatMessage.js';
import type { RenderedProps } from './props.js';

export interface ChatMessageProps extends RenderedProps {
  role?: string;
  author?: string;
  text?: string;
  showAvatar?: boolean;
}

/** The author's first letter, falling back to the role's, for the avatar disc. */
function initialOf(author: string, role: string): string {
  return ([...author.trim()][0] ?? [...role][0] ?? '?').toUpperCase();
}

/**
 * One turn in a conversation — avatar, author and bubble as a single node.
 *
 * The whole message is one node rather than an `HStack` holding an `Avatar` and a
 * `Text`, because `role` has to move four things at once: which side the row sits on,
 * which way the bubble is coloured, whether the avatar appears at all, and whether the
 * body is a bubble or a centred line of system text. Assembled from parts, changing
 * "user" to "assistant" would be a manual edit in four places; here it is one dropdown.
 *
 * The message body is a `text` prop rather than children for the same reason `Select`
 * authors its options as text (§7): a message is a paragraph someone types, not a
 * subtree they assemble. Rich assistant output — code blocks, tables — is what a later
 * `acceptsChildren` pass is for, and it can be added without the stored document
 * changing, since `text` would remain the empty-children rendering.
 *
 * `white-space: pre-wrap` on the bubble is what makes a multi-line message in the
 * inspector's textarea look on the canvas like what was typed.
 */
export function ChatMessage({
  role,
  author,
  text,
  showAvatar,
  className,
  children: _children,
  ...rest
}: ChatMessageProps) {
  const which = asEnum(role, CHAT_ROLES, 'assistant');
  const name = asString(author);
  const body = asString(text);

  // A system line is a note about the conversation rather than a turn in it, so it has
  // no speaker to show — the avatar would be a disc with nobody's initial in it.
  const withAvatar = which !== 'system' && asBoolean(showAvatar, true);

  return (
    <div
      className={['ub-chat-message', className].filter(Boolean).join(' ')}
      data-role={which}
      {...rest}
    >
      {withAvatar ? (
        <span className="ub-chat-message-avatar" aria-hidden="true">
          {initialOf(name, which)}
        </span>
      ) : null}
      <div className="ub-chat-message-body">
        {name === '' ? null : <span className="ub-chat-message-author">{name}</span>}
        <div className="ub-chat-message-bubble">{body}</div>
      </div>
    </div>
  );
}
