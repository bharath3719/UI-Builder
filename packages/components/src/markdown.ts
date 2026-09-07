/**
 * The Markdown subset `RichText` is authored in, parsed to a tree.
 *
 * A tree rather than a string of HTML, and that is the whole point. Three things render
 * this — the canvas, the preview and the exported project — and they must agree
 * character for character (D6). Handing them HTML would mean `dangerouslySetInnerHTML`
 * in two of them and a raw string in the third, which is both an injection surface and
 * a guarantee that the export drifts from the canvas the first time one of them
 * sanitises differently. A tree is rendered by React in the runtime and printed as real
 * JSX by `@ui-builder/codegen`, from the same parse, so the export contains static
 * elements and ships no Markdown parser at all.
 *
 * It lives in `components` rather than in `codegen` for the reason `parseOptions` does:
 * the component that renders it and the template that exports it are two readings of one
 * definition, and the definition belongs next to the component.
 *
 * The subset is deliberate, not a stalled attempt at CommonMark: headings, paragraphs,
 * lists, quotes, fenced code, thematic breaks, and inline emphasis, code and links. It is
 * what a page of copy is made of. Nested lists, tables, footnotes and raw HTML are not
 * here — raw HTML in particular is *not* a gap to fill later, since passing it through
 * would reintroduce exactly the injection surface the tree exists to avoid.
 */

export type RichInline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: RichInline[] }
  | { kind: 'em'; children: RichInline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: RichInline[] };

export type RichBlock =
  | { kind: 'heading'; level: number; children: RichInline[] }
  | { kind: 'paragraph'; children: RichInline[] }
  | { kind: 'list'; ordered: boolean; items: RichInline[][] }
  | { kind: 'quote'; children: RichInline[] }
  | { kind: 'code'; text: string }
  | { kind: 'rule' };

/* -------------------------------------------------------------------------- */
/* Links                                                                       */
/* -------------------------------------------------------------------------- */

const SAFE_SCHEMES = /^(?:https?|mailto|tel):/i;

/**
 * The href a link is allowed to carry, or null when it is not allowed to be one.
 *
 * Author-supplied text becomes an `href` here, so this is the one place in the library
 * where a document could otherwise turn into script. A relative path, a fragment and a
 * query all pass; anything carrying a scheme that is not http, https, mailto or tel is
 * refused, which is what stops `javascript:` and `data:`. Refusing degrades to plain
 * text rather than dropping the content — the words the author wrote still show.
 *
 * Control characters are stripped before the test rather than after, because
 * `java\nscript:` is a scheme to a browser and would not be one to the regex otherwise.
 * They are filtered by code point rather than by a character class so the pattern stays
 * readable and the lint rule against control characters in regexes stays on.
 */
export function safeHref(raw: string): string | null {
  const href = [...raw]
    .filter((character) => {
      const code = character.codePointAt(0)!;
      return code > 0x1f && code !== 0x7f;
    })
    .join('')
    .trim();

  if (href === '') return null;

  // A colon is only a scheme separator before the first `/`, `?` or `#`.
  const head = href.split(/[/?#]/)[0] ?? '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(head) && !SAFE_SCHEMES.test(href)) return null;

  return href;
}

/* -------------------------------------------------------------------------- */
/* Inline                                                                      */
/* -------------------------------------------------------------------------- */

/** Appends to the run of literal text in progress, so `a**b**c` is three nodes not five. */
function pushText(nodes: RichInline[], text: string): void {
  if (text === '') return;
  const last = nodes[nodes.length - 1];
  if (last?.kind === 'text') last.text += text;
  else nodes.push({ kind: 'text', text });
}

/**
 * The index of a closing `marker`, or -1. Escaped markers do not close.
 *
 * A one-character emphasis marker steps over a doubled run rather than matching its
 * first half, which is what makes `*a **b** c*` an em containing a strong instead of
 * three ems in a row.
 */
function closingIndex(source: string, from: number, marker: string): number {
  const single = marker.length === 1;

  for (let at = from; at <= source.length - marker.length; at += 1) {
    if (source[at] === '\\') {
      at += 1;
      continue;
    }
    if (single && source.startsWith(marker + marker, at)) {
      at += 1;
      continue;
    }
    if (source.startsWith(marker, at)) return at;
  }
  return -1;
}

/**
 * The index of the `)` that closes the `(` at `from - 1`, or -1.
 *
 * Depth-counting rather than `indexOf`, because parentheses are legal in a URL and
 * Wikipedia links are the case everyone hits: `[x](https://en.wikipedia.org/wiki/A_(b))`
 * must not end at the inner one.
 */
function closingParen(source: string, from: number): number {
  let depth = 0;

  for (let at = from; at < source.length; at += 1) {
    const character = source[at];
    if (character === '\\') at += 1;
    else if (character === '(') depth += 1;
    else if (character === ')') {
      if (depth === 0) return at;
      depth -= 1;
    }
  }
  return -1;
}

/**
 * Inline Markdown to nodes.
 *
 * Order is precedence, and it follows CommonMark where it matters: a backslash escapes
 * the next character, code spans are literal inside (so `` `**a**` `` is two asterisks
 * and not emphasis), and the two-character emphasis markers are tested before the
 * one-character ones so `**a**` is strong rather than an empty em wrapping one.
 */
export function parseInline(source: string): RichInline[] {
  const nodes: RichInline[] = [];
  let at = 0;

  while (at < source.length) {
    const character = source[at]!;

    if (character === '\\' && at + 1 < source.length) {
      pushText(nodes, source[at + 1]!);
      at += 2;
      continue;
    }

    if (character === '`') {
      const close = source.indexOf('`', at + 1);
      if (close !== -1) {
        nodes.push({ kind: 'code', text: source.slice(at + 1, close) });
        at = close + 1;
        continue;
      }
    }

    if (character === '[') {
      const link = readLink(source, at);
      if (link) {
        nodes.push(...link.nodes);
        at = link.end;
        continue;
      }
    }

    const emphasis =
      readBoth(source, at, '***') ??
      readBoth(source, at, '___') ??
      readEmphasis(source, at, '**', 'strong') ??
      readEmphasis(source, at, '__', 'strong') ??
      readEmphasis(source, at, '*', 'em') ??
      readEmphasis(source, at, '_', 'em');

    if (emphasis) {
      nodes.push(emphasis.node);
      at = emphasis.end;
      continue;
    }

    pushText(nodes, character);
    at += 1;
  }

  return nodes;
}

/**
 * `***both***`, which is strong wrapping em.
 *
 * Handled as its own marker rather than falling out of the general rule, because a run
 * of three is genuinely ambiguous and the symmetric spelling is the one people write.
 * The asymmetric `**bold *and italic***` is outside the subset — it needs CommonMark's
 * delimiter-run algorithm, and it parses here as a strong followed by a stray asterisk.
 */
function readBoth(
  source: string,
  at: number,
  marker: string,
): { node: RichInline; end: number } | null {
  if (!source.startsWith(marker, at)) return null;

  const close = closingIndex(source, at + marker.length, marker);
  if (close === -1 || close === at + marker.length) return null;

  return {
    node: {
      kind: 'strong',
      children: [{ kind: 'em', children: parseInline(source.slice(at + marker.length, close)) }],
    },
    end: close + marker.length,
  };
}

function readEmphasis(
  source: string,
  at: number,
  marker: string,
  kind: 'strong' | 'em',
): { node: RichInline; end: number } | null {
  if (!source.startsWith(marker, at)) return null;

  // A one-character marker sitting at the head of a doubled run is half of a strong
  // delimiter, not an em opener. Without this `****` opens an em on its first asterisk
  // and closes it on its last, which is the one place the closing rule above — which
  // steps *over* doubled runs — would otherwise turn four literal characters into
  // emphasis.
  if (marker.length === 1 && source[at + 1] === marker) return null;

  const close = closingIndex(source, at + marker.length, marker);
  // An empty pair is two literal asterisks, not emphasis wrapping nothing.
  if (close === -1 || close === at + marker.length) return null;

  return {
    node: { kind, children: parseInline(source.slice(at + marker.length, close)) },
    end: close + marker.length,
  };
}

/**
 * `[label](href)` from `at`, or null when it is not one.
 *
 * Returns nodes rather than a node because a refused href still renders its label: the
 * link becomes the text it was made of.
 */
function readLink(source: string, at: number): { nodes: RichInline[]; end: number } | null {
  const labelEnd = closingIndex(source, at + 1, ']');
  if (labelEnd === -1 || source[labelEnd + 1] !== '(') return null;

  const hrefEnd = closingParen(source, labelEnd + 2);
  if (hrefEnd === -1) return null;

  const children = parseInline(source.slice(at + 1, labelEnd));
  const href = safeHref(source.slice(labelEnd + 2, hrefEnd));

  return {
    nodes: href === null ? children : [{ kind: 'link', href, children }],
    end: hrefEnd + 1,
  };
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                      */
/* -------------------------------------------------------------------------- */

const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^ {0,3}(?:```|~~~)/;
const BULLET = /^ {0,3}[-*+]\s+(.*)$/;
const ORDERED = /^ {0,3}\d{1,9}[.)]\s+(.*)$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;

/** Whether a line would start a block of its own, which is what ends a lazy paragraph. */
function startsBlock(line: string): boolean {
  return (
    line.trim() === '' ||
    HEADING.test(line) ||
    RULE.test(line) ||
    FENCE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    QUOTE.test(line)
  );
}

/**
 * Markdown source to blocks.
 *
 * Line-based, single pass, no backtracking. A newline inside a paragraph is a space and
 * a blank line starts a new one, which is CommonMark's soft break — the rule that makes
 * a paragraph reflow to its column instead of keeping the author's window width.
 */
export function parseRichText(source: string): RichBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: RichBlock[] = [];
  let at = 0;

  while (at < lines.length) {
    const line = lines[at]!;

    if (line.trim() === '') {
      at += 1;
      continue;
    }

    // Fenced code first: inside a fence nothing else is markup, including the `---` that
    // would otherwise be a rule.
    if (FENCE.test(line)) {
      const fence = line.trim().slice(0, 3);
      const body: string[] = [];
      at += 1;
      while (at < lines.length && !lines[at]!.trim().startsWith(fence)) {
        body.push(lines[at]!);
        at += 1;
      }
      // An unclosed fence runs to the end of the document rather than being discarded,
      // which is what a half-typed block in the inspector looks like.
      at += 1;
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length,
        children: parseInline(heading[2]!.replace(/\s+#*\s*$/, '')),
      });
      at += 1;
      continue;
    }

    // After the heading test, so `---` is a rule but `--- text` is a paragraph.
    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      at += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (at < lines.length) {
        const quoted = QUOTE.exec(lines[at]!);
        if (quoted) body.push(quoted[1]!);
        else if (lines[at]!.trim() === '' || startsBlock(lines[at]!)) break;
        else body.push(lines[at]!); // lazy continuation
        at += 1;
      }
      blocks.push({ kind: 'quote', children: parseInline(body.join(' ').trim()) });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet ?? ordered) {
      const isOrdered = bullet === null;
      const pattern = isOrdered ? ORDERED : BULLET;
      const items: string[] = [];

      while (at < lines.length) {
        const item = pattern.exec(lines[at]!);
        if (item) {
          items.push(item[1]!);
          at += 1;
          continue;
        }
        // A wrapped item continues the one above it; anything that opens a block of its
        // own — including the *other* kind of list — ends the list.
        if (items.length > 0 && !startsBlock(lines[at]!)) {
          items[items.length - 1] += ` ${lines[at]!.trim()}`;
          at += 1;
          continue;
        }
        break;
      }

      blocks.push({
        kind: 'list',
        ordered: isOrdered,
        items: items.map((item) => parseInline(item.trim())),
      });
      continue;
    }

    const body: string[] = [];
    while (at < lines.length && !startsBlock(lines[at]!)) {
      body.push(lines[at]!.trim());
      at += 1;
    }
    blocks.push({ kind: 'paragraph', children: parseInline(body.join(' ')) });
  }

  return blocks;
}

/** The element a block is rendered and exported as. One answer, read by both. */
export function blockTag(block: RichBlock): string {
  switch (block.kind) {
    case 'heading':
      return `h${Math.min(6, Math.max(1, block.level))}`;
    case 'paragraph':
      return 'p';
    case 'list':
      return block.ordered ? 'ol' : 'ul';
    case 'quote':
      return 'blockquote';
    case 'code':
      return 'pre';
    case 'rule':
      return 'hr';
  }
}

/** The element an inline node is rendered and exported as. `text` has none. */
export function inlineTag(node: Exclude<RichInline, { kind: 'text' }>): string {
  switch (node.kind) {
    case 'strong':
      return 'strong';
    case 'em':
      return 'em';
    case 'code':
      return 'code';
    case 'link':
      return 'a';
  }
}
