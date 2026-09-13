import { parseOptions, selectedOption } from '../derive.js';
import { asEnum, asString } from '../spec.js';
import { TABS_VARIANTS } from '../specs/Tabs.js';
import type { RenderedProps } from './props.js';

export interface TabsProps extends RenderedProps {
  /** One tab per line. `id | Label` splits the two; a bare line is both. */
  items?: string;
  /** The id of the tab that is current. Nothing matching means the first one. */
  active?: string;
  variant?: string;
}

/**
 * A tab strip above a panel.
 *
 * The tabs are text and the panel is this node's children — the trade that made a
 * compound component into one node (see the spec). Exactly one tab is current, chosen by
 * `selectedOption`, which is the same function `codegen` calls: a strip that highlighted
 * nothing on the canvas and something in the export would be D6 broken in the one place
 * anyone would notice.
 *
 * The tabs are real buttons rather than styled spans so a keyboard reaches them, but they
 * switch nothing: what they would switch to is an interaction the document does not carry
 * yet (§10). Drawing a second panel nobody can see would be the dishonest version of that.
 */
export function Tabs({ items, active, variant, className, children, ...rest }: TabsProps) {
  const tabs = parseOptions(asString(items));
  const current = selectedOption(tabs, asString(active));

  return (
    <div
      className={['ub-tabs', className].filter(Boolean).join(' ')}
      data-variant={asEnum(variant, TABS_VARIANTS, 'line')}
      {...rest}
    >
      <div className="ub-tabs-list" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className="ub-tab"
            role="tab"
            aria-selected={tab === current ? 'true' : 'false'}
            data-active={tab === current ? '' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="ub-tabs-panel" role="tabpanel">
        {children}
      </div>
    </div>
  );
}
