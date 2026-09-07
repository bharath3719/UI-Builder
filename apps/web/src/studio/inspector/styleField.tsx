/**
 * The Design tab's fields — a labelled control wired to one CSS property.
 *
 * Each is a thin pairing of `useStyleField` with one control from `controls.tsx`.
 * They stay separate from the controls themselves so the Props tab — which has no
 * cascade and no cell — can use the same controls without inheriting any of that.
 */

import { useId } from 'react';
import { useStudio } from '../state/context.js';
import {
  ColorControl,
  LengthControl,
  Row,
  SegmentedControl,
  SelectControl,
  TextControl,
  type Choice,
} from './controls.js';
import { useStyleField } from './useStyleField.js';

interface FieldProps {
  label: string;
  property: string;
}

export function StyleLength({
  label,
  property,
  affix,
  step,
  placeholder,
}: FieldProps & { affix?: string; step?: number; placeholder?: string }) {
  const id = useId();
  const field = useStyleField(property);

  return (
    <Row label={label} htmlFor={id} overridden={field.overridden} onReset={field.reset}>
      <LengthControl
        id={id}
        value={field.value}
        placeholder={field.placeholder || placeholder}
        onCommit={field.set}
        affix={affix}
        step={step}
      />
    </Row>
  );
}

export function StyleText({
  label,
  property,
  placeholder,
  monospace,
}: FieldProps & { placeholder?: string; monospace?: boolean }) {
  const id = useId();
  const field = useStyleField(property);

  return (
    <Row label={label} htmlFor={id} overridden={field.overridden} onReset={field.reset}>
      <TextControl
        id={id}
        value={field.value}
        placeholder={field.placeholder || placeholder}
        onCommit={field.set}
        monospace={monospace}
      />
    </Row>
  );
}

export function StyleSelect({
  label,
  property,
  choices,
}: FieldProps & { choices: readonly Choice[] }) {
  const id = useId();
  const field = useStyleField(property);

  return (
    <Row label={label} htmlFor={id} overridden={field.overridden} onReset={field.reset}>
      <SelectControl
        id={id}
        value={field.value}
        choices={choices}
        onChange={field.set}
        // The inherited keyword, so an unset field still says what is in force.
        placeholder={field.placeholder || '—'}
      />
    </Row>
  );
}

export function StyleSegmented({
  label,
  property,
  choices,
  wide,
}: FieldProps & { choices: readonly Choice[]; wide?: boolean }) {
  const field = useStyleField(property);

  return (
    <Row label={label} overridden={field.overridden} onReset={field.reset} wide={wide}>
      <SegmentedControl
        label={label}
        // No segment is lit for a mixed selection: lighting the primary's would say
        // the others agreed with it, and one click would then make that true.
        value={field.mixed ? '' : field.value || field.inherited}
        choices={choices}
        onChange={field.set}
      />
    </Row>
  );
}

export function StyleColor({ label, property }: FieldProps) {
  const id = useId();
  const field = useStyleField(property);
  const { theme } = useStudio();

  return (
    <Row label={label} htmlFor={id} overridden={field.overridden} onReset={field.reset}>
      <ColorControl
        id={id}
        value={field.value}
        placeholder={field.placeholder}
        tokens={Object.entries(theme.colors)}
        onCommit={field.set}
      />
    </Row>
  );
}
