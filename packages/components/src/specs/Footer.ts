import type { ComponentSpec } from '../spec.js';

export const FooterSpec: ComponentSpec = {
  key: 'Footer',
  displayName: 'Footer',
  category: 'Layout',
  icon: 'PanelBottom',
  // No 'colophon': it is a keyword prefix match for "col", which is the query PLAN.md §7
  // uses as the example of one that has to surface Vertical Stack.
  keywords: ['footer', 'bottom', 'copyright', 'legal', 'links', 'brand', 'logo', 'sitemap'],
  description: 'A page footer: logo, tagline, links and a copyright line.',

  props: [
    { name: 'brand', label: 'Brand', type: 'string', placeholder: 'Your product' },
    { name: 'logoSrc', label: 'Logo', type: 'url', placeholder: 'https://…' },
    { name: 'tagline', label: 'Tagline', type: 'text', placeholder: 'One line about it' },
    {
      name: 'items',
      label: 'Links',
      type: 'text',
      placeholder: 'One per line — /path | Label',
    },
    { name: 'copyright', label: 'Copyright', type: 'string', placeholder: '© 2026 Acme Inc.' },
    { name: 'bordered', label: 'Top border', type: 'boolean' },
  ],
  events: ['onClick'],
  acceptsChildren: false,
  isVoid: true,

  defaultProps: {
    brand: 'Acme',
    logoSrc: '',
    tagline: 'Everything your team needs, in one place.',
    items: '/about | About\n/pricing | Pricing\n/privacy | Privacy\n/terms | Terms',
    copyright: '© 2026 Acme Inc. All rights reserved.',
    bordered: true,
  },
  // Generous vertical padding, matching the header's per-edge form — a footer is the end
  // of the page, and the space above it is what says so.
  defaultStyles: { paddingTop: 32, paddingRight: 20, paddingBottom: 32, paddingLeft: 20 },

  codegen: {
    tag: 'footer',
    emit: {
      tag: 'footer',
      class: 'ub-footer',
      attrs: { 'data-bordered': { prop: 'bordered', as: 'flag', on: '', default: true } },
      children: [
        {
          tag: 'div',
          class: 'ub-footer-top',
          children: [
            {
              when: {
                any: [
                  { prop: 'brand', when: 'set' },
                  { prop: 'logoSrc', when: 'set' },
                  { prop: 'tagline', when: 'set' },
                ],
              },
              tag: 'div',
              class: 'ub-footer-brand',
              children: [
                {
                  when: {
                    any: [
                      { prop: 'brand', when: 'set' },
                      { prop: 'logoSrc', when: 'set' },
                    ],
                  },
                  tag: 'div',
                  class: 'ub-footer-mark',
                  children: [
                    {
                      when: { prop: 'logoSrc', when: 'set' },
                      tag: 'img',
                      class: 'ub-footer-logo',
                      attrs: {
                        src: { prop: 'logoSrc', as: 'string' },
                        // Decorative, for the reason the Header's is: the wordmark beside
                        // it says the same word, and an alt carrying it reads twice.
                        alt: '',
                        draggable: { const: false },
                      },
                    },
                    {
                      when: { prop: 'brand', when: 'set' },
                      tag: 'span',
                      class: 'ub-footer-name',
                      children: [{ text: { prop: 'brand', as: 'string' } }],
                    },
                  ],
                },
                {
                  when: { prop: 'tagline', when: 'set' },
                  tag: 'p',
                  class: 'ub-footer-tagline',
                  children: [{ text: { prop: 'tagline', as: 'string' } }],
                },
              ],
            },
            // No `active`: a footer says where a site goes, not where the reader is, so
            // there is no current item to mark. The transform reads that from the
            // absence of the field rather than from an empty prop nobody would set.
            {
              when: { prop: 'items', when: 'set' },
              tag: 'nav',
              class: 'ub-footer-nav',
              children: [{ navItems: { items: 'items', class: 'ub-footer-item' } }],
            },
          ],
        },
        {
          when: { prop: 'copyright', when: 'set' },
          tag: 'div',
          class: 'ub-footer-copyright',
          children: [{ text: { prop: 'copyright', as: 'string' } }],
        },
      ],
    },
  },
};
