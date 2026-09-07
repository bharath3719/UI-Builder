/**
 * Behavioural tests for the emitter — the claims the snapshot cannot make on its own.
 *
 * A snapshot says the output has not changed. These say *why* the output is what it is,
 * so that a diff in the snapshot can be read as "this rule changed" rather than "some
 * bytes moved".
 */

import { getSpec, SPECS } from '@ui-builder/components';
import {
  DEFAULT_THEME,
  makeNode,
  makePage,
  staticProp,
  type Json,
  type Theme,
} from '@ui-builder/schema';
import { describe, expect, test } from 'vitest';
import { demoDoc } from './fixtures.js';
import { componentName, generatePage } from './page.js';

function onePage(type: string, props: Record<string, Json> = {}, theme: Theme = DEFAULT_THEME) {
  const node = makeNode({
    id: 'x',
    type,
    name: type,
    props: Object.fromEntries(
      Object.entries(props).map(([name, value]) => [name, staticProp(value)]),
    ),
  });
  const page = makePage({ id: 'p', name: 'Home', path: '/', rootId: 'x', nodes: { x: node } });
  return generatePage(page, theme);
}

describe('templates', () => {
  test('every component in the registry declares one', () => {
    // The fallback in `walkNode` exists for robustness, not as somewhere to leave a
    // component. Without this, adding a component to the palette would silently export
    // it as a bare tag with none of its classes or attributes.
    const missing = SPECS.filter((spec) => spec.codegen.emit === undefined).map((spec) => spec.key);
    expect(missing).toEqual([]);
  });

  test('the root element carries the library class and the node class', () => {
    const { tsx } = generatePage(
      makePage({
        id: 'p',
        name: 'Home',
        path: '/',
        rootId: 'x',
        nodes: {
          x: makeNode({
            id: 'x',
            type: 'Button',
            name: 'Button',
            styles: { base: { default: { color: 'red' } } },
          }),
        },
      }),
      DEFAULT_THEME,
    );

    expect(tsx).toContain("className={`ub-button ${styles['ub-n-x']}`}");
  });

  test('an unstyled node references no stylesheet, and the page imports none', () => {
    const { tsx, usesStyles } = onePage('Button');

    expect(usesStyles).toBe(false);
    expect(tsx).not.toContain('styles');
    expect(tsx).toContain('className="ub-button"');
  });

  test('nested elements never take the node class', () => {
    // Only one element can carry it — the same one the runtime spreads `className` onto
    // — or a rule written for the node would apply two or three times over.
    const { tsx } = generatePage(
      makePage({
        id: 'p',
        name: 'Home',
        path: '/',
        rootId: 'x',
        nodes: {
          x: makeNode({
            id: 'x',
            type: 'Checkbox',
            name: 'Checkbox',
            styles: { base: { default: { color: 'red' } } },
          }),
        },
      }),
      DEFAULT_THEME,
    );

    expect(tsx.match(/styles\['ub-n-x'\]/g)).toHaveLength(1);
  });
});

describe('coercions match the runtime', () => {
  test('an unknown enum value falls back rather than emitting itself', () => {
    const { tsx } = onePage('Text', { size: 'gigantic' });
    expect(tsx).toContain('data-size="base"');
  });

  test('a flag is absent rather than false', () => {
    expect(onePage('HStack', { wrap: false }).tsx).not.toContain('data-wrap');
    expect(onePage('HStack', { wrap: true }).tsx).toContain('data-wrap="true"');
  });

  test('one prop can drive two attributes', () => {
    const external = onePage('Link', { target: 'blank' }).tsx;
    expect(external).toContain('target="_blank"');
    expect(external).toContain('rel="noreferrer noopener"');

    // A same-tab link must carry neither — a stray `rel` would be harmless, a stray
    // `target` would not.
    const internal = onePage('Link', { target: 'self' }).tsx;
    expect(internal).not.toContain('target=');
    expect(internal).not.toContain('rel=');
  });

  test('`fallback` and `orElse` are different questions', () => {
    // Text: an empty string is a deliberate empty paragraph.
    expect(onePage('Text', { text: '' }).tsx).toContain('<p className="ub-text"');
    expect(onePage('Text', {}).tsx).toContain('>Text</p>');

    // Link: an empty href is not a link at all, so it becomes '#'.
    expect(onePage('Link', { href: '' }).tsx).toContain('href="#"');
  });

  test('a number is clamped and rounded the way the component does', () => {
    expect(onePage('Textarea', { rows: 0 }).tsx).toContain('rows={1}');
    expect(onePage('Textarea', { rows: 4.6 }).tsx).toContain('rows={5}');
    expect(onePage('Textarea', {}).tsx).toContain('rows={3}');
  });

  test('the tag can come from a prop', () => {
    expect(onePage('Heading', { level: '3' }).tsx).toContain('<h3');
    expect(onePage('Heading', { level: '9' }).tsx).toContain('<h2');
  });
});

describe('conditional subtrees', () => {
  test('an avatar emits its image or its initials, never both', () => {
    const withImage = onePage('Avatar', { src: 'https://example.com/a.png' }).tsx;
    expect(withImage).toContain('ub-avatar-image');
    expect(withImage).not.toContain('ub-avatar-fallback');

    const withInitials = onePage('Avatar', { fallback: 'Ada Lovelace' }).tsx;
    expect(withInitials).toContain('>AL</span>');
    expect(withInitials).not.toContain('ub-avatar-image');
  });

  test('an empty switch label emits no span', () => {
    expect(onePage('Switch', { label: '' }).tsx).not.toContain('ub-switch-label');
    expect(onePage('Switch', { label: 'On' }).tsx).toContain('ub-switch-label');
  });

  test('a system message has no avatar', () => {
    expect(onePage('ChatMessage', { role: 'system', text: 'joined' }).tsx).not.toContain(
      'ub-chat-message-avatar',
    );
    // …and an assistant one has it without the prop being set, matching the component's
    // `asBoolean(showAvatar, true)`.
    expect(onePage('ChatMessage', { role: 'assistant' }).tsx).toContain('ub-chat-message-avatar');
  });

  test('a select expands its options and only shows a prompt when it has one', () => {
    const { tsx } = onePage('Select', { options: 'a | Apple\nb', placeholder: 'Pick' });
    expect(tsx).toContain('<option value="a">Apple</option>');
    expect(tsx).toContain('<option value="b">b</option>');
    expect(tsx).toContain('<option value="" disabled hidden>Pick</option>');
    expect(tsx).toContain('data-placeholder=""');

    const bare = onePage('Select', { options: 'a', placeholder: '' }).tsx;
    expect(bare).not.toContain('disabled hidden');
    expect(bare).not.toContain('data-placeholder');
  });

  test('a side nav expands its items and marks exactly one as current', () => {
    const { tsx } = onePage('SideNav', {
      title: 'Workspace',
      items: '/ | Home\n/inbox | Inbox\n/reports',
      active: '/inbox',
    });

    expect(tsx).toContain('<div className="ub-side-nav-title">Workspace</div>');
    expect(tsx).toContain('<a className="ub-side-nav-item" href="/">Home</a>');
    // Present-or-absent, matching the `:where([data-active])` rule in `css.ts`.
    expect(tsx).toContain(
      '<a className="ub-side-nav-item" href="/inbox" data-active="" aria-current="page">Inbox</a>',
    );
    // A bare line is its own label, as everywhere else options are authored.
    expect(tsx).toContain('<a className="ub-side-nav-item" href="/reports">/reports</a>');
    expect(tsx.match(/data-active/g)).toHaveLength(1);
  });

  test('a side nav with no title emits no heading, and an unmatched current marks none', () => {
    const { tsx } = onePage('SideNav', { title: '', items: '/ | Home', active: '/nowhere' });

    expect(tsx).not.toContain('ub-side-nav-title');
    expect(tsx).not.toContain('data-active');
  });

  test('a header links its logo home and its action out, with its own item class', () => {
    const { tsx } = onePage('Header', {
      brand: 'Acme',
      logoSrc: 'https://cdn.example/logo.svg',
      homeHref: '/',
      items: '/ | Product\n/pricing | Pricing',
      active: '/pricing',
      cta: 'Get started',
      ctaHref: '/signup',
      bordered: true,
    });

    // The accessible name is on the link, not the image: the wordmark beside it is the
    // same word, and an alt carrying it would read the brand twice.
    expect(tsx).toContain('<a className="ub-header-brand" href="/" aria-label="Acme">');
    // The printer breaks a long attribute list onto its own lines, hence the shape.
    expect(tsx).toContain('src="https://cdn.example/logo.svg"');
    expect(tsx).toContain('className="ub-header-logo"');
    expect(tsx).toContain('alt=""');
    expect(tsx).toContain('draggable={false}');
    expect(tsx).toContain('<span className="ub-header-name">Acme</span>');

    // The shared navItems transform, wearing the header's class rather than the nav's.
    expect(tsx).toContain('<a className="ub-header-item" href="/">Product</a>');
    expect(tsx).toContain('data-active="" aria-current="page"');
    expect(tsx).not.toContain('ub-side-nav-item');

    // An anchor wearing the Button classes, so the exported action goes somewhere.
    expect(tsx).toContain(
      '<a className="ub-button ub-header-cta" href="/signup" data-variant="default" data-size="sm">',
    );
    expect(tsx).toContain('Get started');
    expect(tsx).toContain('data-bordered=""');
  });

  test('a header drops the brand only when both the wordmark and the logo are cleared', () => {
    expect(onePage('Header', { brand: '', logoSrc: '' }).tsx).not.toContain('ub-header-brand');
    expect(onePage('Header', { brand: '', logoSrc: 'x.svg' }).tsx).toContain('ub-header-brand');
    expect(onePage('Header', { brand: 'Acme', logoSrc: '' }).tsx).toContain('ub-header-brand');
  });

  test('an empty header prop takes its section out rather than emitting it blank', () => {
    const { tsx } = onePage('Header', { items: '', cta: '', sticky: false, bordered: false });

    expect(tsx).not.toContain('ub-header-nav');
    expect(tsx).not.toContain('ub-header-cta');
    expect(tsx).not.toContain('data-sticky');
    expect(tsx).not.toContain('data-bordered');
  });

  test('a footer marks no current item, having been given no active prop', () => {
    const { tsx } = onePage('Footer', {
      brand: 'Acme',
      tagline: 'One line about it.',
      items: '/about | About\n/terms',
      copyright: '© 2026 Acme Inc.',
    });

    expect(tsx).toContain('<span className="ub-footer-name">Acme</span>');
    expect(tsx).toContain('<p className="ub-footer-tagline">One line about it.</p>');
    expect(tsx).toContain('<a className="ub-footer-item" href="/about">About</a>');
    expect(tsx).toContain('<a className="ub-footer-item" href="/terms">/terms</a>');
    expect(tsx).toContain('<div className="ub-footer-copyright">© 2026 Acme Inc.</div>');
    // A footer says where a site goes, not where the reader is.
    expect(tsx).not.toContain('data-active');
    expect(tsx).not.toContain('aria-current');
  });

  test('a footer with nothing to say in its brand block omits the block, not just its parts', () => {
    const { tsx } = onePage('Footer', { brand: '', logoSrc: '', tagline: '', copyright: '' });

    expect(tsx).not.toContain('ub-footer-brand');
    expect(tsx).not.toContain('ub-footer-mark');
    expect(tsx).not.toContain('ub-footer-copyright');
  });

  test('a reorderable table exports a body that is a component, and imports it', () => {
    const { tsx, modules } = onePage('Table', {
      columns: 'Name | Role',
      rows: 'Ada | Owner\nGrace | Editor',
      reorderable: true,
    });

    expect(tsx).toContain("import { SortableRows } from '../components/SortableRows';");
    expect(tsx).toContain('<SortableRows>');
    expect(tsx).not.toContain('<tbody>');
    expect(modules.map((module) => module.path)).toEqual(['src/components/SortableRows.tsx']);

    // The handle is markup — it comes from the template like every other cell — and
    // `data-grip` is the one thing `SortableRows` looks for in what it is handed.
    expect(tsx).toContain(
      '<button type="button" className="ub-table-grip" data-grip="" aria-label="Reorder row" />',
    );
    // An empty heading over the handles rather than a named column of controls.
    expect(tsx).toContain('<th className="ub-table-grip-cell" scope="col" />');
    expect(tsx).toContain('<th className="ub-table-header" scope="col">Name</th>');
    expect(tsx).toContain('<td className="ub-table-cell">Ada</td>');
  });

  test('a table that does not reorder is markup and nothing else', () => {
    const { tsx, modules } = onePage('Table', {
      columns: 'Name',
      rows: 'Ada',
      reorderable: false,
    });

    // The whole point of the escape hatch being narrow: a table nobody drags ships no
    // JavaScript, and the export has no `src/components` at all.
    expect(modules).toEqual([]);
    expect(tsx).not.toContain('import');
    expect(tsx).toContain('<tbody>');
    expect(tsx).not.toContain('ub-table-grip');
  });

  test('a table with no rows takes the plain body whatever the reorder switch says', () => {
    // There is nothing to reorder, and the line standing in for the rows is not a row
    // anyone should be able to pick up.
    const { tsx, modules } = onePage('Table', {
      columns: 'Name | Role | Status',
      rows: '',
      reorderable: true,
      emptyText: 'No rows yet.',
    });

    expect(modules).toEqual([]);
    expect(tsx).not.toContain('SortableRows');
    // Four, not three: the column of handles is still one of the table's columns.
    expect(tsx).toContain('<td className="ub-table-empty" colSpan={4}>No rows yet.</td>');
  });

  test('an empty table with nothing to say about it emits no stand-in row', () => {
    const { tsx } = onePage('Table', {
      columns: 'Name',
      rows: '',
      emptyText: '',
      reorderable: false,
    });

    expect(tsx).toContain('<tbody />');
    expect(tsx).not.toContain('ub-table-empty');
  });

  test('a table widens to its longest line rather than dropping what was typed', () => {
    const { tsx } = onePage('Table', {
      columns: 'Name | Role',
      // A Markdown-style row keeps its two cells; the long one adds a column that every
      // other line is then padded out to, so no `<tr>` is short of a `<td>`.
      rows: '| Ada | Owner |\nGrace | Editor | Active',
      reorderable: false,
    });

    expect(tsx.match(/ub-table-header/g)).toHaveLength(3);
    expect(tsx.match(/ub-table-cell/g)).toHaveLength(6);
    expect(tsx).toContain('<td className="ub-table-cell">Ada</td>');
    expect(tsx).toContain('<td className="ub-table-cell">Active</td>');
    // The cells nobody typed are empty cells, not `{''}`.
    expect(tsx).toContain('<td className="ub-table-cell" />');
  });

  test('a table with no header line emits no thead', () => {
    const { tsx } = onePage('Table', { columns: '', rows: 'Ada | Owner', reorderable: false });

    expect(tsx).not.toContain('thead');
    expect(tsx).not.toContain('ub-table-header');
    expect(tsx).toContain('<td className="ub-table-cell">Ada</td>');
  });
});

describe('the page walk', () => {
  test('a hidden node is not in the export, exactly as it is not on the canvas', () => {
    const { tsx } = generatePage(demoDoc().pages[0]!, demoDoc().theme);
    expect(tsx).not.toContain('Not in the export');
  });

  test('a component the library no longer has is skipped, loudly', () => {
    const { tsx, warnings } = generatePage(demoDoc().pages[0]!, demoDoc().theme);

    expect(tsx).not.toContain('Carousel');
    expect(warnings).toEqual([
      'Skipped "Old carousel" (gone): no component named "Carousel" in the library.',
    ]);
  });

  test('a container without `acceptsChildren` drops nothing silently', () => {
    // Text is `isVoid`, so a child could only get there by hand-editing a document.
    // The runtime ignores it; so must the export, and the two must agree.
    expect(getSpec('Text')!.acceptsChildren).toBe(false);
  });
});

describe('page names', () => {
  test('a label becomes an identifier', () => {
    expect(componentName('Home')).toBe('Home');
    expect(componentName('About us')).toBe('AboutUs');
    expect(componentName('sign-in')).toBe('SignIn');
    expect(componentName('404')).toBe('Page404');
    expect(componentName('!')).toBe('Page');
  });
});
