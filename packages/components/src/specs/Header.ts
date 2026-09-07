import type { ComponentSpec } from '../spec.js';

export const HeaderSpec: ComponentSpec = {
  key: 'Header',
  displayName: 'Header',
  category: 'Layout',
  icon: 'PanelTop',
  keywords: ['navbar', 'nav', 'topbar', 'app bar', 'masthead', 'brand', 'logo', 'menu', 'top'],
  description: 'A page header: logo, wordmark, links and one action.',

  props: [
    { name: 'brand', label: 'Brand', type: 'string', placeholder: 'Your product' },
    { name: 'logoSrc', label: 'Logo', type: 'url', placeholder: 'https://…' },
    { name: 'homeHref', label: 'Logo links to', type: 'url', placeholder: '/' },
    {
      name: 'items',
      label: 'Links',
      type: 'text',
      placeholder: 'One per line — /path | Label',
    },
    { name: 'active', label: 'Current', type: 'string', placeholder: '/path' },
    { name: 'cta', label: 'Action', type: 'string', placeholder: 'Get started' },
    { name: 'ctaHref', label: 'Action links to', type: 'url', placeholder: '/signup' },
    { name: 'sticky', label: 'Sticky', type: 'boolean' },
    { name: 'bordered', label: 'Bottom border', type: 'boolean' },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: {
    brand: 'Acme',
    logoSrc: '',
    homeHref: '/',
    items: '/ | Product\n/pricing | Pricing\n/docs | Docs',
    active: '/',
    cta: 'Get started',
    ctaHref: '/signup',
    sticky: false,
    bordered: true,
  },
  // Padding, because a bar whose contents touch the viewport edge is the one measurement
  // someone would otherwise have to set before it looked like a header at all. Per-edge
  // rather than a shorthand so the inspector's spacing box shows what is set.
  defaultStyles: { paddingTop: 12, paddingRight: 20, paddingBottom: 12, paddingLeft: 20 },

  codegen: {
    tag: 'header',
    emit: {
      tag: 'header',
      class: 'ub-header',
      attrs: {
        'data-sticky': { prop: 'sticky', as: 'flag', on: '' },
        'data-bordered': { prop: 'bordered', as: 'flag', on: '', default: true },
      },
      children: [
        // A logo, a wordmark, or both. With both cleared it is not emitted at all, rather
        // than left as an empty anchor holding a flex gap open in the row.
        {
          when: {
            any: [
              { prop: 'brand', when: 'set' },
              { prop: 'logoSrc', when: 'set' },
            ],
          },
          tag: 'a',
          class: 'ub-header-brand',
          attrs: {
            href: { prop: 'homeHref', as: 'string', orElse: '/' },
            // The label rides on the link rather than the image so a screen reader hears
            // the brand once: the wordmark next to the logo is the same word, and an
            // `alt` carrying it too would read the name twice.
            'aria-label': { prop: 'brand', as: 'string', orElse: 'Home' },
          },
          children: [
            {
              when: { prop: 'logoSrc', when: 'set' },
              tag: 'img',
              class: 'ub-header-logo',
              attrs: {
                src: { prop: 'logoSrc', as: 'string' },
                alt: '',
                draggable: { const: false },
              },
            },
            {
              when: { prop: 'brand', when: 'set' },
              tag: 'span',
              class: 'ub-header-name',
              children: [{ text: { prop: 'brand', as: 'string' } }],
            },
          ],
        },
        {
          when: { prop: 'items', when: 'set' },
          tag: 'nav',
          class: 'ub-header-nav',
          children: [{ navItems: { items: 'items', active: 'active', class: 'ub-header-item' } }],
        },
        // An anchor wearing the Button classes rather than a <button>: a header action
        // goes somewhere, and shipping a button that needs an onClick nobody wrote would
        // be a control that does nothing in the exported project.
        {
          when: { prop: 'cta', when: 'set' },
          tag: 'a',
          class: 'ub-button ub-header-cta',
          attrs: {
            href: { prop: 'ctaHref', as: 'string', orElse: '#' },
            'data-variant': 'default',
            'data-size': 'sm',
          },
          children: [{ text: { prop: 'cta', as: 'string' } }],
        },
      ],
    },
  },
};
