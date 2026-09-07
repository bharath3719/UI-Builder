/**
 * The margin/padding editor — PLAN.md §9.
 *
 * A box inside a box, with a field on each of the eight edges, because that is the
 * shape of the thing being edited: `padding-left` is the left edge of the inner box,
 * and finding it there costs no reading at all. Eight labelled rows would need
 * sixteen words to say the same thing and would still be slower to scan.
 *
 * Every field is a full style field, so each edge carries its own override dot's
 * meaning — an edge set in this cell is shown in the accent, an inherited one in the
 * muted grey, and clearing one is deleting its text.
 */

import { useStyleField } from './useStyleField.js';
import styles from './SpacingBox.module.css';

const EDGES = ['Top', 'Right', 'Bottom', 'Left'] as const;
type Edge = (typeof EDGES)[number];

function Edit({
  property,
  title,
  shorthand,
}: {
  property: string;
  title: string;
  /** `margin` or `padding` — the shorthand this edge is one quarter of. */
  shorthand: string;
}) {
  const field = useStyleField(property);

  // Component defaults are written as shorthands (`padding: 16`), so an edge with no
  // longhand of its own is usually still spaced. Falling back to the shorthand is
  // what stops the box reading as empty on a node that plainly has padding — and
  // typing an edge still wins, because `setNodeStyles` appends it after the
  // shorthand already in the bucket, and the later declaration is the one that
  // applies.
  const whole = useStyleField(shorthand);
  const mixed = field.mixed || whole.mixed;
  const inherited = field.inherited || whole.value || whole.inherited;
  // A box this small has no room for the word, so a mixed edge shows an em dash and
  // says the rest in its tooltip. Falling through to the shorthand's inherited value
  // would be worse than saying nothing: it would name a number none of them has.
  const placeholder = mixed ? '–' : inherited || '0';

  return (
    <input
      type="text"
      className={[styles.edge, field.overridden ? styles.edgeSet : ''].filter(Boolean).join(' ')}
      // The value is only ever this cell's own; the inherited one is the placeholder,
      // exactly as in every other field. At this size the distinction is carried by
      // colour alone, which is why the title spells it out.
      value={field.value}
      placeholder={placeholder}
      title={
        mixed
          ? `${title}: differs across the selection`
          : field.overridden
            ? `${title}: ${field.value} — set here`
            : `${title}: ${inherited || 'not set'}`
      }
      aria-label={title}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => field.set(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.currentTarget.blur();
      }}
    />
  );
}

function edges(kind: 'margin' | 'padding'): { edge: Edge; property: string; title: string }[] {
  return EDGES.map((edge) => ({
    edge,
    property: `${kind}${edge}`,
    title: `${kind === 'margin' ? 'Margin' : 'Padding'} ${edge.toLowerCase()}`,
  }));
}

export function SpacingBox() {
  return (
    <div className={styles.box}>
      <div className={styles.margin}>
        <span className={styles.caption}>Margin</span>
        {edges('margin').map(({ edge, property, title }) => (
          <div key={property} className={styles[`slot${edge}`]}>
            <Edit property={property} title={title} shorthand="margin" />
          </div>
        ))}

        <div className={styles.padding}>
          <span className={styles.caption}>Padding</span>
          {edges('padding').map(({ edge, property, title }) => (
            <div key={property} className={styles[`slot${edge}`]}>
              <Edit property={property} title={title} shorthand="padding" />
            </div>
          ))}
          <div className={styles.content} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
