/**
 * The Design tab — PLAN.md §9.
 *
 * Every field writes a CSS property into the active breakpoint/state cell, and
 * nothing here is per-component: a style section applies to whatever is selected,
 * because CSS does. What *is* per-component lives in the Props tab.
 *
 * The section order is the order a layout is usually reasoned about — where it sits
 * and how it arranges its children first, then its own size, then its spacing, then
 * how it looks. Typography sits above the paint sections because text is the thing
 * most often adjusted after a layout is right.
 */

import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceAround,
  AlignHorizontalSpaceBetween,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  StretchHorizontal,
} from 'lucide-react';
import { useStudio } from '../state/context.js';
import { Section } from './Section.js';
import { SpacingBox } from './SpacingBox.js';
import { StyleColor, StyleLength, StyleSegmented, StyleSelect, StyleText } from './styleField.js';
import { useStyleField } from './useStyleField.js';

/* --- Choice lists ---------------------------------------------------------- */

const DISPLAY = [
  { label: 'Block', value: 'block' },
  { label: 'Flex', value: 'flex' },
  { label: 'Grid', value: 'grid' },
  { label: 'Inline', value: 'inline' },
  { label: 'Inline block', value: 'inline-block' },
  { label: 'Inline flex', value: 'inline-flex' },
  { label: 'None', value: 'none' },
] as const;

/**
 * Arrows rather than the column/row glyphs: the four values are two axes times two
 * directions, and an icon pair that shows only the axis makes `row` and `row-reverse`
 * identical buttons. An arrow says which way the children run, which is the whole
 * difference between them.
 */
const DIRECTION = [
  { label: 'Row', value: 'row', icon: <ArrowRight size={13} /> },
  { label: 'Column', value: 'column', icon: <ArrowDown size={13} /> },
  { label: 'Row reversed', value: 'row-reverse', icon: <ArrowLeft size={13} /> },
  { label: 'Column reversed', value: 'column-reverse', icon: <ArrowUp size={13} /> },
] as const;

const ALIGN_ITEMS = [
  { label: 'Start', value: 'flex-start', icon: <AlignHorizontalJustifyStart size={13} /> },
  { label: 'Center', value: 'center', icon: <AlignHorizontalJustifyCenter size={13} /> },
  { label: 'End', value: 'flex-end', icon: <AlignHorizontalJustifyEnd size={13} /> },
  { label: 'Stretch', value: 'stretch', icon: <StretchHorizontal size={13} /> },
  { label: 'Baseline', value: 'baseline', icon: <AlignJustify size={13} /> },
] as const;

const JUSTIFY_CONTENT = [
  { label: 'Start', value: 'flex-start', icon: <AlignHorizontalJustifyStart size={13} /> },
  { label: 'Center', value: 'center', icon: <AlignHorizontalJustifyCenter size={13} /> },
  { label: 'End', value: 'flex-end', icon: <AlignHorizontalJustifyEnd size={13} /> },
  {
    label: 'Space between',
    value: 'space-between',
    icon: <AlignHorizontalSpaceBetween size={13} />,
  },
  { label: 'Space around', value: 'space-around', icon: <AlignHorizontalSpaceAround size={13} /> },
] as const;

const WRAP = [
  { label: 'No wrap', value: 'nowrap' },
  { label: 'Wrap', value: 'wrap' },
  { label: 'Wrap reverse', value: 'wrap-reverse' },
] as const;

const OVERFLOW = [
  { label: 'Visible', value: 'visible' },
  { label: 'Hidden', value: 'hidden' },
  { label: 'Scroll', value: 'scroll' },
  { label: 'Auto', value: 'auto' },
] as const;

const TEXT_ALIGN = [
  { label: 'Left', value: 'left', icon: <AlignLeft size={13} /> },
  { label: 'Center', value: 'center', icon: <AlignCenter size={13} /> },
  { label: 'Right', value: 'right', icon: <AlignRight size={13} /> },
  { label: 'Justify', value: 'justify', icon: <AlignJustify size={13} /> },
] as const;

const FONT_WEIGHT = [
  { label: 'Regular — 400', value: '400' },
  { label: 'Medium — 500', value: '500' },
  { label: 'Semibold — 600', value: '600' },
  { label: 'Bold — 700', value: '700' },
] as const;

const BORDER_STYLE = [
  { label: 'Solid', value: 'solid' },
  { label: 'Dashed', value: 'dashed' },
  { label: 'Dotted', value: 'dotted' },
  { label: 'None', value: 'none' },
] as const;

const POSITION = [
  { label: 'Static', value: 'static' },
  { label: 'Relative', value: 'relative' },
  { label: 'Absolute', value: 'absolute' },
  { label: 'Fixed', value: 'fixed' },
  { label: 'Sticky', value: 'sticky' },
] as const;

/* --- Sections -------------------------------------------------------------- */

const LAYOUT_PROPERTIES = [
  'display',
  'flexDirection',
  'alignItems',
  'justifyContent',
  'gap',
  'flexWrap',
];

/**
 * The flex and grid rows appear only when the element is actually laid out that way —
 * an `align-items` field on a `display: block` element is a control that does nothing,
 * and a panel full of those teaches people to ignore the panel.
 *
 * The display can come from either of two places, and both have to be consulted. The
 * node's own resolved style is the first, so a `display: flex` inherited from the base
 * breakpoint still opens the rows. The second is the component itself: a `VStack` is a
 * flex container because of a rule in the library's stylesheet, with nothing in the
 * document saying so — reading only the document would hide these controls on exactly
 * the components they exist for.
 */
function LayoutSection() {
  const display = useStyleField('display');
  const { page, selectedId, specFor } = useStudio();
  const node = selectedId ? page.nodes[selectedId] : undefined;
  const spec = node ? specFor(node.type) : undefined;

  // The document wins when it says anything: setting Display to `block` on a VStack
  // has to close the flex rows, not be overruled by the spec's default.
  const value = display.value || display.inherited || spec?.layout || '';
  const isFlex = value === 'flex' || value === 'inline-flex';
  const isGrid = value === 'grid' || value === 'inline-grid';

  return (
    <Section title="Layout" properties={LAYOUT_PROPERTIES}>
      <StyleSelect label="Display" property="display" choices={DISPLAY} />

      {isFlex ? (
        <>
          <StyleSegmented label="Direction" property="flexDirection" choices={DIRECTION} />
          <StyleSegmented label="Align" property="alignItems" choices={ALIGN_ITEMS} />
          <StyleSegmented label="Justify" property="justifyContent" choices={JUSTIFY_CONTENT} />
          <StyleSelect label="Wrap" property="flexWrap" choices={WRAP} />
        </>
      ) : null}

      {isGrid ? (
        <>
          <StyleText label="Columns" property="gridTemplateColumns" placeholder="1fr 1fr" />
          <StyleText label="Rows" property="gridTemplateRows" placeholder="auto" />
        </>
      ) : null}

      {isFlex || isGrid ? <StyleLength label="Gap" property="gap" /> : null}
    </Section>
  );
}

const SIZE_PROPERTIES = [
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'aspectRatio',
  'overflow',
  'flexGrow',
];

function SizeSection() {
  return (
    <Section title="Size" properties={SIZE_PROPERTIES}>
      <StyleLength label="Width" property="width" placeholder="auto" />
      <StyleLength label="Height" property="height" placeholder="auto" />
      <StyleLength label="Min W" property="minWidth" placeholder="0" />
      <StyleLength label="Min H" property="minHeight" placeholder="0" />
      <StyleLength label="Max W" property="maxWidth" placeholder="none" />
      <StyleLength label="Max H" property="maxHeight" placeholder="none" />
      <StyleText label="Ratio" property="aspectRatio" placeholder="auto" />
      <StyleLength label="Grow" property="flexGrow" placeholder="0" />
      <StyleSelect label="Overflow" property="overflow" choices={OVERFLOW} />
    </Section>
  );
}

const TYPOGRAPHY_PROPERTIES = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'color',
  'textTransform',
];

function TypographySection() {
  return (
    <Section title="Typography" properties={TYPOGRAPHY_PROPERTIES}>
      <StyleColor label="Color" property="color" />
      <StyleText label="Font" property="fontFamily" placeholder="var(--font-sans)" monospace />
      <StyleLength label="Size" property="fontSize" placeholder="16" />
      <StyleSelect label="Weight" property="fontWeight" choices={FONT_WEIGHT} />
      {/* Line height steps by a tenth: it is a ratio, and a step of 1 would take it
          from 1.5 to 2.5 in a keypress. */}
      <StyleLength label="Line height" property="lineHeight" placeholder="1.5" step={0.1} />
      <StyleLength label="Tracking" property="letterSpacing" placeholder="0" step={0.1} />
      <StyleSegmented label="Align" property="textAlign" choices={TEXT_ALIGN} />
    </Section>
  );
}

const BACKGROUND_PROPERTIES = ['backgroundColor', 'backgroundImage', 'backgroundSize'];

function BackgroundSection() {
  return (
    <Section title="Background" properties={BACKGROUND_PROPERTIES}>
      <StyleColor label="Color" property="backgroundColor" />
      <StyleText label="Image" property="backgroundImage" placeholder="url(...)" monospace />
      <StyleText label="Size" property="backgroundSize" placeholder="cover" />
    </Section>
  );
}

const BORDER_PROPERTIES = ['borderWidth', 'borderStyle', 'borderColor', 'borderRadius'];

function BorderSection() {
  return (
    <Section title="Border" properties={BORDER_PROPERTIES}>
      <StyleLength label="Width" property="borderWidth" placeholder="0" />
      <StyleSelect label="Style" property="borderStyle" choices={BORDER_STYLE} />
      <StyleColor label="Color" property="borderColor" />
      <StyleLength label="Radius" property="borderRadius" placeholder="0" />
    </Section>
  );
}

const EFFECTS_PROPERTIES = ['boxShadow', 'opacity', 'transform', 'transition', 'cursor'];

function EffectsSection() {
  return (
    <Section title="Effects" properties={EFFECTS_PROPERTIES}>
      <StyleText
        label="Shadow"
        property="boxShadow"
        placeholder="0 1px 2px rgb(0 0 0 / 0.1)"
        monospace
      />
      <StyleLength label="Opacity" property="opacity" placeholder="1" step={0.1} />
      <StyleText label="Transform" property="transform" placeholder="none" monospace />
      {/* A transition is what makes a hover style read as an interaction rather than
          a jump, so it belongs next to the state switcher's output. */}
      <StyleText label="Transition" property="transition" placeholder="none" monospace />
      <StyleText label="Cursor" property="cursor" placeholder="auto" />
    </Section>
  );
}

/** The eight edges the box editor writes, plus the shorthands it would be hiding. */
const SPACING_PROPERTIES = [
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'margin',
  'padding',
];

const POSITION_PROPERTIES = ['position', 'top', 'right', 'bottom', 'left', 'zIndex'];

function PositionSection() {
  const position = useStyleField('position');
  const value = position.value || position.inherited;
  const offset = value !== '' && value !== 'static';

  return (
    <Section title="Position" properties={POSITION_PROPERTIES}>
      <StyleSelect label="Position" property="position" choices={POSITION} />
      {offset ? (
        <>
          <StyleLength label="Top" property="top" placeholder="auto" />
          <StyleLength label="Right" property="right" placeholder="auto" />
          <StyleLength label="Bottom" property="bottom" placeholder="auto" />
          <StyleLength label="Left" property="left" placeholder="auto" />
        </>
      ) : null}
      <StyleLength label="Z-index" property="zIndex" placeholder="auto" />
    </Section>
  );
}

export function DesignTab() {
  return (
    <>
      <LayoutSection />
      <SizeSection />
      <Section title="Spacing" properties={SPACING_PROPERTIES}>
        <SpacingBox />
      </Section>
      <TypographySection />
      <BackgroundSection />
      <BorderSection />
      <EffectsSection />
      <PositionSection />
    </>
  );
}
