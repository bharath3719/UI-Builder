/**
 * The Props tab — PLAN.md §9, decision D7.
 *
 * Generated entirely from `ComponentSpec.props`. There is no per-component code here
 * and there must never be: a component that needs a hand-written panel is a component
 * whose spec is wrong, and the moment one exists the registry stops being the single
 * source the palette, the renderer and codegen all read.
 *
 * Props are not styles. They have no breakpoint and no state — a `variant` is part of
 * what the component *is*, not how it looks at 768px — so this tab ignores the cell
 * switchers entirely and edits `node.props` directly.
 */

import { useId, useState } from 'react';
import type { PropSpec } from '@ui-builder/components';
import { readProp, staticProp, type Json, type Node } from '@ui-builder/schema';
import { ExpressionField } from '../expressions/ExpressionField.js';
import { scopeSuggestions } from '../expressions/scope.js';
import { useStudio } from '../state/context.js';
import {
  ColorControl,
  Row,
  SelectControl,
  TextAreaControl,
  TextControl,
  ToggleControl,
} from './controls.js';
import { Section } from './Section.js';
import { MIXED_PLACEHOLDER } from './useStyleField.js';
import styles from './Inspector.module.css';

function PropField({ node, spec }: { node: Node; spec: PropSpec }) {
  const id = useId();
  const { setProp, theme, page, symbol, selectedIds } = useStudio();
  const raw = readProp(node, spec.name);

  // The whole selection, not just the primary — the tab only renders at all when every
  // member is the same component, so every one of them has this prop.
  const peers = selectedIds.flatMap((peerId) => page.nodes[peerId] ?? []);

  // Only a value the document actually carries counts as set. A prop showing the
  // component's own default is not an override and offers no reset — the same rule
  // the Design tab's fields follow.
  const overridden = peers.some((peer) => peer.props[spec.name] !== undefined);
  // Compared by their JSON, not by reference: two nodes that both say `"Save"` hold
  // two different `{ kind: 'static' }` objects.
  const mixed = peers.some(
    (peer) => JSON.stringify(readProp(peer, spec.name)) !== JSON.stringify(raw),
  );

  const reset = () => setProp(spec.name, undefined);
  const commit = (value: Json) => setProp(spec.name, staticProp(value));
  // A field whose selection disagrees shows nothing and says so, for the reason the
  // Design tab's do: a box holding one member's value invites a keystroke that would
  // quietly overwrite the rest.
  const text = mixed ? '' : typeof raw === 'string' ? raw : '';
  // `in` rather than `spec.placeholder`: an enum's spec has no placeholder field, and
  // the enum branch below reads the mixed flag directly anyway.
  const placeholder = mixed
    ? MIXED_PLACEHOLDER
    : 'placeholder' in spec
      ? spec.placeholder
      : undefined;

  /**
   * Whether this row is showing an expression field.
   *
   * A stored expression forces it on; otherwise it is the toggle's own state, so a row
   * switched to binding stays switched while it is still empty and has nothing to read
   * back from the document.
   */
  const stored = node.props[spec.name];
  const [binding, setBinding] = useState(false);
  const bound = stored?.kind === 'expr' || binding;

  const row = (children: React.ReactNode) => (
    <Row
      label={spec.label}
      htmlFor={id}
      overridden={overridden}
      onReset={reset}
      wide={spec.type === 'text' || bound}
      bind={{
        bound,
        onToggle: () => {
          // Going back to a fixed value drops the expression: there is no literal to
          // fall back to, and keeping one would mean the row showed a value the
          // document does not have.
          if (bound && stored?.kind === 'expr') setProp(spec.name, undefined);
          setBinding(!bound);
        },
      }}
    >
      {children}
    </Row>
  );

  if (bound) {
    return row(
      <ExpressionField
        id={id}
        value={stored}
        suggestions={scopeSuggestions(page, { symbol })}
        placeholder={symbol ? '{{ props.value }}' : '{{ state.value }}'}
        onCommit={(next) => setProp(spec.name, next)}
      />,
    );
  }

  if (spec.type === 'boolean') {
    return row(
      <ToggleControl
        id={id}
        label={spec.label}
        value={typeof raw === 'boolean' ? raw : false}
        onChange={commit}
      />,
    );
  }

  if (spec.type === 'enum') {
    return row(
      <SelectControl
        id={id}
        value={mixed ? '' : typeof raw === 'string' ? raw : ''}
        choices={spec.options}
        placeholder={mixed ? MIXED_PLACEHOLDER : undefined}
        onChange={commit}
      />,
    );
  }

  if (spec.type === 'number') {
    return row(
      <TextControl
        id={id}
        value={mixed || raw === undefined || raw === null ? '' : String(raw)}
        placeholder={placeholder}
        onCommit={(text) => {
          const trimmed = text.trim();
          const parsed = Number(trimmed);
          // A number prop that cannot hold a number is worse than one that ignores a
          // typo: the component would coerce it silently and the field would keep
          // showing what was typed.
          commit(trimmed === '' || Number.isNaN(parsed) ? null : parsed);
        }}
      />,
    );
  }

  if (spec.type === 'color') {
    return row(
      <ColorControl
        id={id}
        value={text}
        placeholder={mixed ? MIXED_PLACEHOLDER : undefined}
        tokens={Object.entries(theme.colors)}
        onCommit={commit}
      />,
    );
  }

  // 'text' is the multi-line string — a paragraph of copy, or the list of choices a
  // Select is authored with. It gets a full-width row; a label does not need one.
  if (spec.type === 'text') {
    return row(
      <TextAreaControl id={id} value={text} placeholder={placeholder} onCommit={commit} />,
    );
  }

  return row(
    <TextControl
      id={id}
      value={text}
      placeholder={placeholder}
      onCommit={commit}
      monospace={spec.type === 'url'}
    />,
  );
}

export function PropsTab({ node }: { node: Node }) {
  const spec = useStudio().specFor(node.type);

  if (!spec) {
    return (
      <p className={styles.empty}>
        <code>{node.type}</code> is not in the component library, so it has no props to show.
      </p>
    );
  }

  if (spec.props.length === 0) {
    return <p className={styles.empty}>{spec.displayName} takes no props.</p>;
  }

  return (
    <Section title={spec.displayName}>
      {spec.props.map((prop) => (
        <PropField key={prop.name} node={node} spec={prop} />
      ))}
    </Section>
  );
}
