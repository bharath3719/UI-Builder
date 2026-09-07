/**
 * The fields that edit template source — PLAN.md §10.
 *
 * Two exports over one implementation. `TemplateField` edits a plain string that happens
 * to be a template: a query's URL, a header, a body. `ExpressionField` edits a
 * `PropValue`, which is the same text plus one rule — text with a `{{ }}` in it is an
 * expression, text without one is a literal. That is exactly the rule §10 settled on when
 * it dropped the separate `Expr` type, and it is why neither control has a mode to
 * switch: type `/about` and it is a literal, type `{{ state.next }}` and it is not.
 *
 * The field owns its own `<input>` rather than reusing `TextControl` because completion
 * needs the keyboard: Enter has to mean "take the highlighted name" while the list is
 * open and "commit" when it is not, and a control that cannot see its own keydowns
 * cannot say that. The commit rules are otherwise `TextControl`'s, deliberately — blur
 * and Enter commit, Escape abandons, and a value changed elsewhere re-syncs unless it is
 * being typed into.
 */

import { hasInterpolation, validateTemplate, type Json, type PropValue } from '@ui-builder/schema';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { asText, propOf, textOfProp } from './propValue.js';
import { applyCompletion, completionAt, matchSuggestions } from './scope.js';
import styles from './Expression.module.css';

export interface TemplateFieldProps {
  value: string;
  onCommit: (value: string) => void;
  /** Scope paths to offer inside a hole. See `scopeSuggestions`. */
  suggestions: readonly string[];
  id?: string;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
}

export function TemplateField({
  value,
  onCommit,
  suggestions,
  id,
  placeholder,
  multiline,
  disabled,
}: TemplateFieldProps) {
  const [draft, setDraft] = useState(value);
  const [caret, setCaret] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  /** Escape closes the list without leaving the field; typing opens it again. */
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(value);
  }, [value]);

  /**
   * Puts the DOM caret where the state says it is.
   *
   * `caret` is the source of truth in both directions: typing reports where the caret
   * landed, and accepting a completion *decides* where it should land. This only has to
   * close the second case, so it does nothing whenever the two already agree — which is
   * every keystroke. Layout rather than passive, so the caret is never painted at the
   * end of the inserted text first.
   */
  useLayoutEffect(() => {
    const element = inputRef.current;
    if (!element || caret === null) return;
    if (document.activeElement !== element) return;
    if (element.selectionStart === caret) return;
    element.setSelectionRange(caret, caret);
  }, [draft, caret]);

  const target = focused && caret !== null ? completionAt(draft, caret) : null;
  const matches = target ? matchSuggestions(suggestions, target.token) : [];
  const open = !dismissed && matches.length > 0;
  const index = Math.min(highlight, matches.length - 1);

  const problem = validateTemplate(draft);
  const bound = hasInterpolation(draft);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  const accept = (choice: string) => {
    if (!target) return;
    const next = applyCompletion(draft, target, choice);
    setDraft(next.text);
    setCaret(next.caret);
    setHighlight(0);
  };

  /** Every way the caret moves that is not a keystroke handled below. */
  const syncCaret = (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
    setCaret(event.currentTarget.selectionStart);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlight((current) => (current + 1) % matches.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlight((current) => (current - 1 + matches.length) % matches.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        accept(matches[index]!);
        return;
      }
      if (event.key === 'Escape') {
        // Closes the list and keeps the edit. Escaping again abandons it.
        event.preventDefault();
        setDismissed(true);
        return;
      }
    }

    // Enter in a multi-line field inserts a newline, as it does in `TextAreaControl`: a
    // body someone is writing JSON into cannot have Enter mean done.
    if (event.key === 'Enter' && !multiline) {
      event.preventDefault();
      commit();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(value);
      inputRef.current?.blur();
    }
  };

  const shared = {
    id,
    value: draft,
    placeholder,
    disabled,
    spellCheck: false,
    autoComplete: 'off' as const,
    'aria-expanded': open,
    onKeyDown,
    onKeyUp: syncCaret,
    onClick: syncCaret,
    onSelect: syncCaret,
    onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFocused(true);
      setDismissed(false);
      setCaret(event.currentTarget.selectionStart);
    },
    onBlur: () => {
      setFocused(false);
      commit();
    },
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(event.target.value);
      setCaret(event.target.selectionStart);
      setDismissed(false);
      setHighlight(0);
    },
  };

  return (
    <div className={styles.field}>
      <div className={styles.inputWrap}>
        {multiline ? (
          <textarea
            {...shared}
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            rows={3}
            className={[styles.input, styles.area, bound ? styles.bound : '']
              .filter(Boolean)
              .join(' ')}
          />
        ) : (
          <input
            {...shared}
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            className={[styles.input, bound ? styles.bound : ''].filter(Boolean).join(' ')}
          />
        )}

        {open ? (
          <ul className={styles.suggestions} role="listbox" aria-label="Names in scope">
            {matches.map((path, at) => (
              <li key={path}>
                <button
                  type="button"
                  role="option"
                  aria-selected={at === index}
                  className={[styles.suggestion, at === index ? styles.suggestionActive : '']
                    .filter(Boolean)
                    .join(' ')}
                  // Keeps focus in the field, so choosing does not commit through blur
                  // and tear the list down mid-click.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => accept(path)}
                >
                  {path}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {problem.ok ? null : <p className={styles.problem}>{problem.message}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The same field, over a PropValue                                            */
/* -------------------------------------------------------------------------- */

export interface ExpressionFieldProps extends Omit<TemplateFieldProps, 'value' | 'onCommit'> {
  value: PropValue | undefined;
  onCommit: (value: PropValue | undefined) => void;
  /** How the literal branch reads what was typed. Text, unless the target has a type. */
  parse?: (text: string) => Json;
}

export function ExpressionField({
  value,
  onCommit,
  parse = asText,
  ...rest
}: ExpressionFieldProps) {
  return (
    <TemplateField
      {...rest}
      value={textOfProp(value)}
      onCommit={(text) => onCommit(propOf(text, parse))}
    />
  );
}
