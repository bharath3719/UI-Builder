/**
 * The Interactions tab — PLAN.md §9 and §10.
 *
 * Three things live here, and they are the three that decide what a node *does* rather
 * than how it looks: the handlers on its declared events, whether it repeats, and
 * whether it renders at all.
 *
 * Like the Props tab, the event list is generated from the spec (D7) — a component's
 * events are declared once, and a handler this panel offered for an event the renderer
 * does not attach would be a handler that silently never runs.
 *
 * Unlike the Design tab, everything here writes to the *primary* selection only. An
 * action list is a sequence someone authored for one thing; copying it onto four nodes
 * because they happened to be selected is not an edit anyone asked for.
 */

import {
  ACTION_KINDS,
  setNodeEvent,
  setNodeRepeat,
  setNodeShowIf,
  staticProp,
  type ActionStep,
  type Json,
  type Node,
  type Page,
  type PropValue,
} from '@ui-builder/schema';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { useStudio } from '../state/context.js';
import { ExpressionField } from '../expressions/ExpressionField.js';
import { scopeSuggestions } from '../expressions/scope.js';
import { parseStateValue } from '../expressions/stateValue.js';
import { Section } from './Section.js';
import styles from './Interactions.module.css';
import inspector from './Inspector.module.css';

/** What each step is called in the panel. The union is closed, so this list is total. */
const STEP_LABELS: Record<ActionStep['kind'], string> = {
  setState: 'Set variable',
  toggleState: 'Toggle variable',
  runQuery: 'Run query',
  navigate: 'Navigate',
  showToast: 'Show toast',
  custom: 'Run code',
};

/**
 * A new step of a kind, with its required fields filled in.
 *
 * A step is created complete rather than half-built, because a `setState` with no
 * `stateId` is not representable — the schema says the field is there — and a panel that
 * needed to hold an incomplete one would need a second, looser type to hold it in.
 */
function blankStep(kind: ActionStep['kind'], page: Page): ActionStep | null {
  switch (kind) {
    case 'setState':
    case 'toggleState': {
      const variable = page.state[0];
      // Nothing to point at. The panel offers the kind anyway and says why, which is a
      // better answer than an option that vanishes when a page has no variables yet.
      if (!variable) return null;
      return kind === 'toggleState'
        ? { kind, stateId: variable.id }
        : { kind, stateId: variable.id, value: staticProp('') };
    }

    case 'runQuery': {
      const query = page.queries[0];
      if (!query) return null;
      return { kind, queryId: query.id };
    }

    case 'navigate':
      return { kind, to: staticProp('/') };

    case 'showToast':
      return { kind, message: staticProp('') };

    case 'custom':
      return { kind, code: '' };
  }
}

/** Why a step kind cannot be added yet, or null when it can. */
function unavailable(kind: ActionStep['kind'], page: Page): string | null {
  if ((kind === 'setState' || kind === 'toggleState') && page.state.length === 0) {
    return 'Add a state variable first';
  }
  if (kind === 'runQuery' && page.queries.length === 0) return 'Add a query first';
  return null;
}

function moved<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

interface StepProps {
  node: Node;
  event: string;
  steps: readonly ActionStep[];
  index: number;
}

function StepEditor({ node, event, steps, index }: StepProps) {
  const id = useId();
  const { page, symbol, edit, writable } = useStudio();
  const step = steps[index]!;

  // A handler's expressions see the event; that is the whole of "bind this input".
  const suggestions = scopeSuggestions(page, {
    event: true,
    item: node.repeat !== undefined,
    symbol,
  });

  const write = (next: readonly ActionStep[]) => {
    edit((current) => setNodeEvent(current, node.id, event, [...next]));
  };

  const replace = (next: ActionStep) => write(steps.map((s, at) => (at === index ? next : s)));

  const commitProp = (field: 'value' | 'to' | 'message', value: PropValue | undefined) => {
    // Clearing a step's argument leaves the step; an empty message is still a toast, and
    // removing the step is what the bin is for.
    const fallback = staticProp('');
    if (step.kind === 'setState' && field === 'value') {
      replace({ ...step, value: value ?? fallback });
    } else if (step.kind === 'navigate' && field === 'to') {
      replace({ ...step, to: value ?? fallback });
    } else if (step.kind === 'showToast' && field === 'message') {
      replace({ ...step, message: value ?? fallback });
    }
  };

  const variable =
    step.kind === 'setState' ? page.state.find((v) => v.id === step.stateId) : undefined;

  return (
    <li className={styles.step}>
      <div className={styles.stepHead}>
        <span className={styles.stepIndex} aria-hidden="true">
          {index + 1}
        </span>

        <select
          className={styles.kind}
          value={step.kind}
          disabled={!writable}
          aria-label={`Step ${index + 1} action`}
          onChange={(changed) => {
            const kind = changed.target.value as ActionStep['kind'];
            const blank = blankStep(kind, page);
            if (blank) replace(blank);
          }}
        >
          {ACTION_KINDS.map((kind) => {
            const why = unavailable(kind, page);
            return (
              <option key={kind} value={kind} disabled={why !== null && kind !== step.kind}>
                {STEP_LABELS[kind]}
                {why ? ` — ${why}` : ''}
              </option>
            );
          })}
        </select>

        <div className={styles.stepTools}>
          <button
            type="button"
            className={styles.tool}
            disabled={!writable || index === 0}
            title="Move up"
            aria-label={`Move step ${index + 1} up`}
            onClick={() => write(moved(steps, index, index - 1))}
          >
            <ArrowUp size={12} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.tool}
            disabled={!writable || index === steps.length - 1}
            title="Move down"
            aria-label={`Move step ${index + 1} down`}
            onClick={() => write(moved(steps, index, index + 1))}
          >
            <ArrowDown size={12} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.tool}
            disabled={!writable}
            title="Remove this step"
            aria-label={`Remove step ${index + 1}`}
            onClick={() => write(steps.filter((_, at) => at !== index))}
          >
            <Trash2 size={12} aria-hidden />
          </button>
        </div>
      </div>

      <div className={styles.stepBody}>
        {step.kind === 'setState' || step.kind === 'toggleState' ? (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`${id}-var`}>
              Variable
            </label>
            <select
              id={`${id}-var`}
              className={styles.select}
              value={step.stateId}
              disabled={!writable}
              onChange={(changed) => replace({ ...step, stateId: changed.target.value })}
            >
              {page.state.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {step.kind === 'setState' ? (
          <div className={styles.field}>
            {/* The label names the field and nothing else. Wrapping the control *and*
                its hint in one `<label>` would make the whole paragraph part of the
                field's accessible name, which is what a screen reader reads out. */}
            <label className={styles.fieldLabel} htmlFor={id}>
              To
            </label>
            <ExpressionField
              id={id}
              value={step.value}
              suggestions={suggestions}
              disabled={!writable}
              placeholder="A value, or {{ an expression }}"
              // A literal typed here means what the variable's own type says it means.
              parse={(text): Json => parseStateValue(variable?.type ?? 'string', text)}
              onCommit={(next) => commitProp('value', next)}
            />
          </div>
        ) : null}

        {step.kind === 'runQuery' ? (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={`${id}-query`}>
              Query
            </label>
            <select
              id={`${id}-query`}
              className={styles.select}
              value={step.queryId}
              disabled={!writable}
              onChange={(changed) => replace({ ...step, queryId: changed.target.value })}
            >
              {page.queries.map((query) => (
                <option key={query.id} value={query.id}>
                  {query.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {step.kind === 'navigate' ? (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={id}>
              To
            </label>
            <ExpressionField
              id={id}
              value={step.to}
              suggestions={suggestions}
              disabled={!writable}
              placeholder="/about"
              onCommit={(next) => commitProp('to', next)}
            />
          </div>
        ) : null}

        {step.kind === 'showToast' ? (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={id}>
              Message
            </label>
            <ExpressionField
              id={id}
              value={step.message}
              suggestions={suggestions}
              disabled={!writable}
              placeholder="Saved"
              onCommit={(next) => commitProp('message', next)}
            />
          </div>
        ) : null}

        {step.kind === 'custom' ? (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={id}>
              Code
            </label>
            {/* Statements, not a template — no `{{ }}`, and the scope's names are in
                scope directly. The one place the studio lets someone write JavaScript,
                and it runs in the canvas frame like every other expression. */}
            <textarea
              id={id}
              className={styles.code}
              rows={3}
              value={step.code}
              disabled={!writable}
              spellCheck={false}
              placeholder="state.count > 3 && console.log(state.count)"
              onChange={(changed) => replace({ ...step, code: changed.target.value })}
            />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function EventEditor({ node, event }: { node: Node; event: string }) {
  const { page, edit, writable } = useStudio();
  const steps = node.events[event] ?? [];

  const add = () => {
    // The first kind that can actually be built on this page, so a page with no
    // variables adds a toast rather than a step pointing at nothing.
    const kind = ACTION_KINDS.find((candidate) => blankStep(candidate, page) !== null);
    const step = kind ? blankStep(kind, page) : null;
    if (!step) return;

    edit((current) => setNodeEvent(current, node.id, event, [...steps, step]));
  };

  return (
    <Section title={event}>
      {steps.length === 0 ? (
        <p className={styles.empty}>Nothing happens on {event} yet.</p>
      ) : (
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <StepEditor
              // Steps have no ids, and reordering by index would reuse a row for a
              // different step. The kind and position together are enough to keep a
              // field's draft with the step it belongs to.
              key={`${index}:${step.kind}`}
              node={node}
              event={event}
              steps={steps}
              index={index}
            />
          ))}
        </ol>
      )}

      <button type="button" className={styles.add} disabled={!writable} onClick={add}>
        <Plus size={12} aria-hidden />
        Add step
      </button>
    </Section>
  );
}

/** `repeat` and `showIf` — what the data says about whether this node is here at all. */
function RenderingSection({ node }: { node: Node }) {
  const repeatId = useId();
  const showIfId = useId();
  const { page, symbol, edit, writable } = useStudio();

  const isRoot = node.parentId === null;
  const suggestions = scopeSuggestions(page, { item: node.repeat !== undefined, symbol });

  return (
    <Section title="Rendering">
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={repeatId}>
          Repeat over
        </label>
        {isRoot ? (
          <p className={styles.empty}>A page&rsquo;s root cannot repeat.</p>
        ) : (
          <>
            <ExpressionField
              id={repeatId}
              value={node.repeat?.over}
              suggestions={scopeSuggestions(page, { symbol })}
              disabled={!writable}
              placeholder="{{ queries.users.data }}"
              onCommit={(next) => {
                edit((current) =>
                  setNodeRepeat(current, node.id, next === undefined ? undefined : { over: next }),
                );
              }}
            />
            <p className={styles.hint}>
              A list, or a number. Each copy sees <code>item</code> and <code>index</code>.
            </p>
          </>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={showIfId}>
          Show if
        </label>
        <ExpressionField
          id={showIfId}
          value={node.showIf}
          suggestions={suggestions}
          disabled={!writable}
          placeholder="{{ state.isOpen }}"
          onCommit={(next) => edit((current) => setNodeShowIf(current, node.id, next))}
        />
        <p className={styles.hint}>
          Left empty, the node always renders. On the canvas a node whose condition is false stays
          visible but dimmed, so it can still be selected.
        </p>
      </div>
    </Section>
  );
}

export function InteractionsTab({ node }: { node: Node }) {
  const spec = useStudio().specFor(node.type);

  return (
    <>
      <RenderingSection node={node} />

      {spec && spec.events.length > 0 ? (
        spec.events.map((event) => <EventEditor key={event} node={node} event={event} />)
      ) : (
        <p className={inspector.empty}>{spec?.displayName ?? node.type} has no events to handle.</p>
      )}
    </>
  );
}
