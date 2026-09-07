import { useMemo, useRef, useState } from 'react';
import { Search, Square } from 'lucide-react';
import {
  createNodeFor,
  getSpec,
  searchSpecs,
  specsByCategory,
  type ComponentSpec,
} from '@ui-builder/components';
import { ICON_BY_KEY, SYMBOL_ICON_COMPONENT as SYMBOL_ICON } from '@ui-builder/components/react';
import {
  canPlaceSymbol,
  insertNode,
  symbolIdOf,
  type NodeId,
  type Page,
  type ProjectDoc,
} from '@ui-builder/schema';
import { useStudio, type EditTarget } from '../state/context.js';
import { beginDragSession, studioSurface } from '../dnd/dragSession.js';
import styles from './Palette.module.css';

/**
 * Where a component goes when it is inserted without being dragged anywhere.
 *
 * The selected node if it can hold children, otherwise the selected node's parent —
 * so clicking a Text and then clicking Button puts the button beside the text, which
 * is what "add another one of these" means. With nothing selected it lands in the
 * page root.
 */
function insertionTarget(
  page: Page,
  selectedId: NodeId | null,
  specFor: (type: string) => ComponentSpec | undefined,
): { parentId: NodeId; index?: number } {
  const selected = selectedId ? page.nodes[selectedId] : undefined;
  if (!selected) return { parentId: page.rootId };

  if (specFor(selected.type)?.acceptsChildren) return { parentId: selected.id };

  const parent = selected.parentId ? page.nodes[selected.parentId] : undefined;
  if (!parent) return { parentId: page.rootId };

  return { parentId: parent.id, index: parent.children.indexOf(selected.id) + 1 };
}

/** The answer to a search that matched nothing. */
const BOX_SPEC = getSpec('Box');

/**
 * The components this surface may hold.
 *
 * The whole library, plus the document's own — minus, while a component is open, the ones
 * that would make it contain itself. Hiding them is where that rule is enforced: a drag
 * that cannot land is worse than an entry that is not offered, because the indicator would
 * have to explain itself and there is nowhere to say it.
 */
function placeable(
  doc: ProjectDoc,
  target: EditTarget,
  specs: readonly ComponentSpec[],
): ComponentSpec[] {
  if (target.kind === 'page') return [...specs];

  return specs.filter((spec) => {
    const symbolId = symbolIdOf(spec.key);
    return symbolId === null || canPlaceSymbol(doc, symbolId, target.id);
  });
}

function PaletteItem({ spec }: { spec: ComponentSpec }) {
  const studio = useStudio();
  // A spec names its icon; the React half of the library holds the icons themselves, so
  // that reading a spec does not drag lucide into the API's bundle. A test there fails
  // the build on a name with no icon, which makes this fallback belt-and-braces — but a
  // blank where the picture goes collapses the row, and the wrong picture does not.
  // A symbol's key carries its id, so it can never be in the table — one shared icon
  // stands for all of them, which is `SYMBOL_ICON_COMPONENT`. Both operands are module
  // constants, which is what React's compiler lint requires of a component value.
  const Icon = ICON_BY_KEY[spec.key] ?? (spec.category === 'Symbols' ? SYMBOL_ICON : Square);

  const insert = () => {
    const node = createNodeFor(spec);
    const target = insertionTarget(studio.page, studio.selectedId, studio.specFor);
    studio.edit((page) =>
      insertNode(page, { node, parentId: target.parentId, index: target.index }),
    );
    studio.select(node.id);
  };

  return (
    <button
      type="button"
      className={styles.item}
      title={spec.description}
      // The press is not committed to being either a click or a drag yet — the
      // session decides, once the pointer has moved far enough to mean it.
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);

        beginDragSession({
          studio,
          source: { kind: 'new', componentKey: spec.key },
          label: spec.displayName,
          origin: { x: event.clientX, y: event.clientY },
          surfaces: [studioSurface()],
          onClick: insert,
        });
      }}
      // Keyboard parity: the palette must be usable without a pointer at all.
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          insert();
        }
      }}
    >
      <Icon className={styles.itemIcon} size={15} strokeWidth={1.75} aria-hidden />
      <span className={styles.itemName}>{spec.displayName}</span>
    </button>
  );
}

/**
 * The component library — PLAN.md §7.
 *
 * Reads the registry and nothing else: a component appears here because its spec
 * exists, never because it was also listed in the palette (D7).
 */
export function Palette() {
  const studio = useStudio();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { doc, target, symbols } = studio;

  const results = useMemo(
    () => (query.trim() ? placeable(doc, target, searchSpecs(query, symbols)) : null),
    [query, doc, target, symbols],
  );

  const groups = useMemo(
    () =>
      specsByCategory(symbols)
        .map((group) => ({ ...group, specs: placeable(doc, target, group.specs) }))
        .filter((group) => group.specs.length > 0),
    [doc, target, symbols],
  );

  return (
    <div className={styles.palette}>
      <div className={styles.search}>
        <Search className={styles.searchIcon} size={13} strokeWidth={2} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          className={styles.searchInput}
          placeholder="Search components"
          aria-label="Search components"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query) {
              event.stopPropagation();
              setQuery('');
            }
          }}
        />
      </div>

      {results ? (
        results.length > 0 ? (
          <div className={styles.grid}>
            {results.map((spec) => (
              <PaletteItem key={spec.key} spec={spec} />
            ))}
          </div>
        ) : (
          // §7: a zero-result state offers Box rather than an apology, because "an
          // element I will style myself" is always a valid answer.
          <div className={styles.empty}>
            <p className={styles.emptyText}>No component matches “{query}”.</p>
            {BOX_SPEC ? <PaletteItem spec={BOX_SPEC} /> : null}
          </div>
        )
      ) : (
        groups.map((group) => (
          <section key={group.category} className={styles.group}>
            <h3 className={styles.groupTitle}>{group.category}</h3>
            <div className={styles.grid}>
              {group.specs.map((spec) => (
                <PaletteItem key={spec.key} spec={spec} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
