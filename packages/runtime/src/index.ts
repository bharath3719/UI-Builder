/**
 * @ui-builder/runtime — turns a document into DOM.
 *
 * Dependency direction (PLAN.md §2): schema <- components <- runtime <- web.
 */

export { PageRenderer, type PageRendererProps } from './PageRenderer.js';
export {
  NODE_ID_ATTRIBUTE,
  NODE_ERROR_ATTRIBUTE,
  NODE_INACTIVE_ATTRIBUTE,
  NODE_STATUS_CSS,
} from './attributes.js';
export {
  createEvaluator,
  runStatements,
  type EvalRealm,
  type EvaluatorOptions,
  type ExpressionError,
} from './evaluate.js';
export { runSteps, asJson, type ActionHost } from './actions.js';
export {
  resolveStateValues,
  stateReducer,
  usePageState,
  type PageState,
  type StateAction,
  type StateOverrides,
} from './state.js';
export {
  buildRequest,
  cyclicQueries,
  usePageQueries,
  type PageQueries,
  type QueryRequest,
} from './queries.js';
export { usePageRuntime, type PageRuntimeValue, type Toast } from './runtime.js';
