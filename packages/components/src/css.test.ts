import { describe, expect, it } from 'vitest';
import { COMPONENT_CSS, EMPTY_CONTAINER_CSS } from './css.js';
import { SPECS } from './registry.js';

/**
 * The library's CSS is a string, so nothing type-checks it and no bundler parses it.
 * These are the cheap invariants that catch the ways a hand-edited stylesheet in a
 * template literal actually goes wrong.
 */
describe('COMPONENT_CSS', () => {
  it('has balanced braces', () => {
    expect(COMPONENT_CSS.match(/\{/g)?.length).toBe(COMPONENT_CSS.match(/\}/g)?.length);
    expect(EMPTY_CONTAINER_CSS.match(/\{/g)?.length).toBe(EMPTY_CONTAINER_CSS.match(/\}/g)?.length);
  });

  it('carries no backtick, which would terminate the literal it lives in', () => {
    expect(COMPONENT_CSS).not.toContain('`');
    expect(EMPTY_CONTAINER_CSS).not.toContain('`');
  });

  it('styles every class the components actually render', () => {
    for (const selector of [
      '.ub-box',
      '.ub-stack',
      '.ub-grid',
      '.ub-spacer',
      '.ub-divider',
      '.ub-side-nav',
      '.ub-side-nav-title',
      '.ub-side-nav-item',
      '.ub-header',
      '.ub-header-brand',
      '.ub-header-logo',
      '.ub-header-name',
      '.ub-header-nav',
      '.ub-header-item',
      '.ub-header-cta',
      '.ub-footer',
      '.ub-footer-top',
      '.ub-footer-brand',
      '.ub-footer-mark',
      '.ub-footer-logo',
      '.ub-footer-name',
      '.ub-footer-tagline',
      '.ub-footer-nav',
      '.ub-footer-item',
      '.ub-footer-copyright',
      '.ub-text',
      '.ub-heading',
      '.ub-button',
      '.ub-link',
      '.ub-badge',
      '.ub-avatar',
      '.ub-avatar-image',
      '.ub-avatar-fallback',
      '.ub-input',
      '.ub-textarea',
      '.ub-select',
      '.ub-multiselect',
      '.ub-multiselect-field',
      '.ub-multiselect-placeholder',
      '.ub-multiselect-chips',
      '.ub-multiselect-chip',
      '.ub-multiselect-menu',
      '.ub-multiselect-option',
      '.ub-multiselect-check',
      '.ub-multiselect-label',
      '.ub-checkbox',
      '.ub-checkbox-input',
      '.ub-checkbox-label',
      '.ub-switch',
      '.ub-switch-input',
      '.ub-switch-label',
      '.ub-radio-group',
      '.ub-radio',
      '.ub-radio-input',
      '.ub-radio-label',
      '.ub-slider',
      '.ub-date',
      '.ub-rich-text',
      '.ub-card',
      '.ub-table',
      '.ub-table-caption',
      '.ub-table-head',
      '.ub-table-header',
      '.ub-table-row',
      '.ub-table-cell',
      '.ub-table-empty',
      '.ub-table-grip-cell',
      '.ub-table-grip',
      '.ub-image',
      '.ub-chat-thread',
      '.ub-chat-message',
      '.ub-chat-message-avatar',
      '.ub-chat-message-body',
      '.ub-chat-message-author',
      '.ub-chat-message-bubble',
      '.ub-prompt-input',
      '.ub-prompt-input-field',
      '.ub-prompt-input-footer',
      '.ub-prompt-input-hint',
      '.ub-prompt-input-send',
      '.ub-typing-indicator',
      '.ub-typing-dots',
      '.ub-typing-dot',
      '.ub-typing-label',
      '.ub-code-block',
      '.ub-code-block-header',
      '.ub-code-block-name',
      '.ub-code-block-language',
      '.ub-code-block-pre',
      '.ub-code-block-code',
      '.ub-tool-call',
      '.ub-tool-call-summary',
      '.ub-tool-call-dot',
      '.ub-tool-call-name',
      '.ub-tool-call-state',
      '.ub-tool-call-body',
      '.ub-tool-call-section',
      '.ub-tool-call-label',
      '.ub-tool-call-code',
      '.ub-citation',
      '.ub-citation-index',
      '.ub-citation-label',
      '.ub-source-card',
      '.ub-source-card-head',
      '.ub-source-card-index',
      '.ub-source-card-source',
      '.ub-source-card-title',
      '.ub-source-card-snippet',
      '.ub-alert',
      '.ub-alert-icon',
      '.ub-alert-body',
      '.ub-alert-title',
      '.ub-alert-text',
      '.ub-progress',
      '.ub-progress-head',
      '.ub-progress-label',
      '.ub-progress-value',
      '.ub-progress-bar',
      '.ub-breadcrumb',
      '.ub-breadcrumb-item',
      '.ub-scroll',
      '.ub-modal',
      '.ub-modal-backdrop',
      '.ub-modal-panel',
      '.ub-modal-header',
      '.ub-modal-heading',
      '.ub-modal-title',
      '.ub-modal-description',
      '.ub-modal-close',
      '.ub-modal-body',
      '.ub-drawer',
      '.ub-drawer-backdrop',
      '.ub-drawer-panel',
      '.ub-drawer-header',
      '.ub-drawer-title',
      '.ub-drawer-close',
      '.ub-drawer-body',
      '.ub-tooltip',
      '.ub-tooltip-trigger',
      '.ub-tooltip-bubble',
      '.ub-tabs',
      '.ub-tabs-list',
      '.ub-tab',
      '.ub-tabs-panel',
      '.ub-accordion',
      '.ub-accordion-item',
      '.ub-accordion-summary',
      '.ub-accordion-body',
    ]) {
      expect(COMPONENT_CSS, `${selector} has no rule`).toContain(selector);
    }
  });

  it('has a rule for every enum value the specs offer', () => {
    // A variant a user can pick from the inspector but that no rule matches would
    // render as an unstyled control — the failure mode is silent, so it is asserted.
    // Only the enum props that render as an attribute. `target` is absent because it
    // becomes a DOM attribute of its own — there is no rule for it to match, and
    // asserting one would be asserting the wrong thing.
    const attributeFor: Record<string, string> = {
      variant: 'data-variant',
      size: 'data-size',
      gap: 'data-gap',
      level: 'data-level',
      tone: 'data-tone',
      fit: 'data-fit',
      align: 'data-align',
      justify: 'data-justify',
      columns: 'data-columns',
      orientation: 'data-orientation',
      underline: 'data-underline',
      role: 'data-role',
    };

    for (const spec of SPECS) {
      for (const prop of spec.props) {
        if (prop.type !== 'enum') continue;
        const attribute = attributeFor[prop.name];
        if (!attribute) continue;

        for (const option of prop.options) {
          expect(COMPONENT_CSS, `${spec.key}.${prop.name}="${option.value}" has no rule`).toContain(
            `[${attribute}='${option.value}']`,
          );
        }
      }
    }
  });

  it('holds every attribute selector at zero specificity', () => {
    // A variant rule written as `.ub-stack[data-direction='vertical']` weighs two
    // selectors and out-specifies the `.ub-n-<id>` rule the inspector writes, so the
    // Design tab would silently fail to override it. `:where()` keeps the library at
    // one class of weight, which is what makes source order decide.
    //
    // Comments come out first. This stylesheet explains itself in prose about the very
    // selectors it writes, so a sentence naming `[data-series]` is ordinary and is not a
    // rule — and a guard that fires on its own file's commentary is one whose next fix
    // is to reword the comment rather than the CSS.
    const rules = COMPONENT_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

    for (const [match] of rules.matchAll(/(?<!:where\()\[data-[a-z-]+/g)) {
      expect.fail(`${match} is not wrapped in :where() — it would out-specify a node rule`);
    }
  });

  it('reaches for no !important, which nothing downstream could override', () => {
    expect(COMPONENT_CSS).not.toContain('!important');
  });

  it('references only theme tokens the default theme defines', async () => {
    const { DEFAULT_THEME } = await import('@ui-builder/schema');

    const defined = new Set([
      ...Object.keys(DEFAULT_THEME.colors),
      ...Object.keys(DEFAULT_THEME.fonts).map((name) => `font-${name}`),
      ...Object.keys(DEFAULT_THEME.space).map((name) => `space-${name}`),
      ...Object.keys(DEFAULT_THEME.radii).map((name) => `radius-${name}`),
      // Properties the sheet declares for itself, which is how a component varies a
      // descendant without a descendant selector — a `.ub-table[data-compact]
      // .ub-table-cell` rule weighs two classes and would out-specify the node's own.
      // The `--ub-` prefix is what keeps one of these from quietly shadowing a token,
      // and a `var(--ub-…)` nothing declares still fails here.
      ...[...COMPONENT_CSS.matchAll(/--(ub-[a-z0-9-]+):/g)].map(([, name]) => name!),
    ]);

    for (const [, name] of COMPONENT_CSS.matchAll(/var\(--([a-z0-9-]+)/g)) {
      expect(defined.has(name!), `--${name} is used but the theme does not define it`).toBe(true);
    }
  });
});
