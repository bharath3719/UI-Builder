import type { ComponentSpec } from '../spec.js';

export const IMAGE_FITS = ['cover', 'contain', 'fill'] as const;

/**
 * An inline SVG rather than a hosted file, so a new Image has something to show
 * before the asset pipeline exists and a project with no network still renders.
 */
export const IMAGE_PLACEHOLDER_SRC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
       <rect width="320" height="200" fill="hsl(210 40% 96%)"/>
       <path d="M0 152l88-72 62 50 46-34 124 96V200H0z" fill="hsl(214 32% 87%)"/>
       <circle cx="238" cy="52" r="22" fill="hsl(214 32% 87%)"/>
     </svg>`.replace(/\s+/g, ' '),
  );

export const ImageSpec: ComponentSpec = {
  key: 'Image',
  displayName: 'Image',
  category: 'Media',
  icon: 'Image',
  keywords: ['img', 'picture', 'photo', 'media', 'asset', 'graphic'],
  description: 'An image, with a placeholder until you set a source.',

  props: [
    { name: 'src', label: 'Source', type: 'url', placeholder: 'https://…' },
    { name: 'alt', label: 'Alt text', type: 'string', placeholder: 'Describe the image' },
    {
      name: 'fit',
      label: 'Fit',
      type: 'enum',
      options: IMAGE_FITS.map((value) => ({ label: value, value })),
    },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: { alt: '', fit: 'cover' },
  defaultStyles: { width: 320, height: 200, borderRadius: 'var(--radius-md)' },

  codegen: {
    tag: 'img',
    emit: {
      tag: 'img',
      class: 'ub-image',
      attrs: {
        // The placeholder goes into the export too, so a project handed over before its
        // assets exist still renders rather than showing broken-image icons.
        src: { prop: 'src', as: 'string', orElse: IMAGE_PLACEHOLDER_SRC },
        // Empty alt is a real, meaningful value — a decorative image — so it is never
        // replaced with a default.
        alt: { prop: 'alt', as: 'string', fallback: '' },
        'data-fit': { prop: 'fit', as: 'enum', options: IMAGE_FITS, fallback: 'cover' },
        draggable: { const: false },
      },
    },
  },
};
