import type { ComponentSpec } from '../spec.js';

/**
 * shadcn/ui's variant and size taxonomy, exactly. Keeping the names identical is what
 * makes the shadcn code emitter a rename rather than a translation: this node's props
 * are already the props `<Button>` takes.
 */
export const BUTTON_VARIANTS = [
  'default',
  'secondary',
  'outline',
  'ghost',
  'destructive',
  'link',
] as const;
export const BUTTON_SIZES = ['sm', 'default', 'lg', 'icon'] as const;

export const ButtonSpec: ComponentSpec = {
  key: 'Button',
  displayName: 'Button',
  category: 'Basic',
  icon: 'MousePointerClick',
  keywords: ['btn', 'cta', 'action', 'submit', 'click', 'primary'],
  description: 'A clickable action, in the shadcn variants.',

  props: [
    { name: 'text', label: 'Label', type: 'string', placeholder: 'Button' },
    {
      name: 'variant',
      label: 'Variant',
      type: 'enum',
      options: BUTTON_VARIANTS.map((value) => ({ label: value, value })),
    },
    {
      name: 'size',
      label: 'Size',
      type: 'enum',
      options: BUTTON_SIZES.map((value) => ({ label: value, value })),
    },
    { name: 'disabled', label: 'Disabled', type: 'boolean' },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { text: 'Button', variant: 'default', size: 'default' },
  defaultStyles: {},

  // The CSS-Modules emitter writes the <button> below; the shadcn emitter swaps `tag`
  // for `{ importFrom: '@/components/ui/button', tag: 'Button' }` and passes `variant`
  // and `size` straight through instead of expanding this template.
  codegen: {
    tag: 'button',
    emit: {
      tag: 'button',
      class: 'ub-button',
      attrs: {
        // Always type="button", for the same reason the component hard-codes it: an
        // exported Button inside a form must not submit it by accident.
        type: 'button',
        'data-variant': {
          prop: 'variant',
          as: 'enum',
          options: BUTTON_VARIANTS,
          fallback: 'default',
        },
        'data-size': { prop: 'size', as: 'enum', options: BUTTON_SIZES, fallback: 'default' },
        // The attribute drives the style, the property drives behaviour — both, so a
        // disabled button in the export looks and acts the way it did on the canvas.
        'data-disabled': { prop: 'disabled', as: 'flag', on: '' },
        disabled: { prop: 'disabled', as: 'boolean' },
      },
      children: [{ text: { prop: 'text', as: 'string', fallback: 'Button' } }],
    },
  },
};
