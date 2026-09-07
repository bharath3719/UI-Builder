/**
 * The small facts every keyboard binding in the studio needs to agree on.
 *
 * Kept in one module because they are the kind of thing that gets re-derived slightly
 * differently at each call site: one panel that answers "is the user typing?" with a
 * shorter list of tags than another is a binding that eats characters out of a field.
 */

/** Whether an event landed in something the user is typing into. */
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

const isApple =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

/** How the platform's command modifier is written in a menu. */
export const MOD_LABEL = isApple ? '⌘' : 'Ctrl+';

/**
 * The command modifier, accepting either key on either platform.
 *
 * Deliberately not exclusive: a Mac keyboard on Windows and a muscle-memory ⌘ both
 * arrive here, and no studio shortcut means one thing with Ctrl and another with ⌘.
 */
export function hasMod(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}
