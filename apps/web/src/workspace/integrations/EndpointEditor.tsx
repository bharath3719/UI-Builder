import { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import {
  HTTP_METHODS,
  parseTemplate,
  type ApiEndpointSummary,
  type ApiIntegrationSummary,
  type HttpMethod,
  type TestApiEndpointResponse,
  type UpdateApiEndpointRequest,
} from '@ui-builder/schema';
import { formErrorMessage, serverFieldErrors } from '../../lib/formErrors.js';
import { Button } from '../../ui/Button.js';
import { FormError } from '../../ui/Dialog.js';
import { Field } from '../../ui/Field.js';
import { headersFromRows, rowsFromHeaders, type HeaderRow } from './headers.js';
import { HeadersEditor } from './HeadersEditor.js';
import { ResultPathPicker } from './ResultPathPicker.js';
import styles from './Integrations.module.css';

interface Draft {
  name: string;
  method: HttpMethod;
  path: string;
  headers: HeaderRow[];
  body: string;
  resultPath: string;
}

function draftFrom(endpoint: ApiEndpointSummary): Draft {
  return {
    name: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    headers: rowsFromHeaders(endpoint.headers),
    body: endpoint.body ?? '',
    resultPath: endpoint.resultPath,
  };
}

/** GET and DELETE carry no body — `buildIntegrationRequest` drops one, so don't offer it. */
function sendsBody(method: HttpMethod): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH';
}

/**
 * Every `{{ hole }}` across the whole request, in the order they appear.
 *
 * The test run has no page behind it, so there is no `state` for a hole to read — the
 * panel has to collect a value for each one. Finding them by parsing the same templates
 * the request builder will parse is what keeps the form and the request in agreement:
 * a hole that is not listed here is a hole that would resolve to empty.
 */
function templateHoles(draft: Draft): string[] {
  const sources = [draft.path, draft.body, ...draft.headers.map((row) => row.value)];
  const names = new Set<string>();

  for (const source of sources) {
    for (const segment of parseTemplate(source)) {
      if (segment.kind === 'expr') {
        const name = segment.code.trim();
        if (name !== '') names.add(name);
      }
    }
  }

  return [...names];
}

/** A compact, readable rendering of whatever came back. */
function ResultView({ result }: { result: TestApiEndpointResponse }) {
  return (
    <div className={styles.result}>
      <div className={styles.resultHead}>
        <span className={result.ok ? styles.badgeOk : styles.badgeBad}>
          {result.status === null ? 'Failed' : `${result.status} ${result.statusText}`.trim()}
        </span>
        <span className={styles.resultUrl} title={result.requestUrl}>
          {result.requestUrl}
        </span>
        {result.status !== null && (
          <span className={styles.resultTime}>{result.durationMs} ms</span>
        )}
      </div>

      {result.error && (
        <p className={styles.resultError} role="alert">
          {result.error}
        </p>
      )}

      {result.body !== null && (
        <pre className={styles.resultBody}>{JSON.stringify(result.body, null, 2)}</pre>
      )}

      {result.saved && (
        <p className={styles.hint}>Saved as this endpoint&rsquo;s sample response.</p>
      )}
    </div>
  );
}

export function EndpointEditor({
  integration,
  endpoint,
  canWrite,
  onSave,
  onDelete,
  onTest,
  saveError,
  saving,
  deleting,
  testing,
  result,
}: {
  integration: ApiIntegrationSummary;
  endpoint: ApiEndpointSummary;
  canWrite: boolean;
  onSave: (input: UpdateApiEndpointRequest) => void;
  onDelete: () => void;
  onTest: (variables: Record<string, string>) => void;
  saveError: unknown;
  saving: boolean;
  deleting: boolean;
  testing: boolean;
  result: TestApiEndpointResponse | undefined;
}) {
  /** Remounted per endpoint by the caller's `key`, so neither of these needs resetting. */
  const [draft, setDraft] = useState<Draft>(() => draftFrom(endpoint));
  const [variables, setVariables] = useState<Record<string, string>>({});

  const holes = useMemo(() => templateHoles(draft), [draft]);
  const fieldErrors = serverFieldErrors(saveError);

  function patch(changes: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function save() {
    onSave({
      name: draft.name,
      method: draft.method,
      path: draft.path,
      headers: headersFromRows(draft.headers),
      // Empty means "no body", which is null on the wire — an endpoint with `body: ''`
      // and one with no body at all should not be two different stored states.
      body: draft.body === '' ? null : draft.body,
      resultPath: draft.resultPath,
    });
  }

  return (
    <div className={styles.form}>
      {formErrorMessage(saveError) && <FormError>{formErrorMessage(saveError)}</FormError>}

      <Field
        label="Name"
        value={draft.name}
        disabled={!canWrite}
        onChange={(event) => patch({ name: event.target.value })}
        error={fieldErrors.name}
        hint="What this call is called in the canvas."
      />

      <div className={styles.pathRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="endpoint-method">
            Method
          </label>
          <select
            id="endpoint-method"
            className={styles.select}
            value={draft.method}
            disabled={!canWrite}
            onChange={(event) => patch({ method: event.target.value as HttpMethod })}
          >
            {HTTP_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Path"
          value={draft.path}
          disabled={!canWrite}
          placeholder="/users/{{ userId }}"
          onChange={(event) => patch({ path: event.target.value })}
          error={fieldErrors.path}
        />
      </div>

      <p className={styles.urlPreview}>
        <span className={styles.urlBase}>{integration.baseUrl}</span>
        {draft.path}
      </p>

      <div className={styles.field}>
        <span className={styles.label}>Headers</span>
        <HeadersEditor
          rows={draft.headers}
          onChange={(headers) => patch({ headers })}
          disabled={!canWrite}
        />
      </div>

      {sendsBody(draft.method) && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="endpoint-body">
            Body
          </label>
          <textarea
            id="endpoint-body"
            className={styles.textarea}
            rows={5}
            value={draft.body}
            disabled={!canWrite}
            placeholder={'{\n  "name": "{{ name }}"\n}'}
            onChange={(event) => patch({ body: event.target.value })}
          />
          <span className={styles.hint}>
            Sent as {integration.contentType}. Use {'{{ }}'} for values that come from the page.
          </span>
        </div>
      )}

      <ResultPathPicker
        sample={endpoint.sampleResponse}
        value={draft.resultPath}
        disabled={!canWrite}
        onChange={(resultPath) => patch({ resultPath })}
      />

      {canWrite && (
        <div className={styles.testBlock}>
          <span className={styles.label}>Test this endpoint</span>
          <p className={styles.hint}>
            Run it from the server to check it works and capture a sample response. The sample is
            what lets a table offer field names instead of asking you to remember them.
          </p>

          {holes.length > 0 && (
            <div className={styles.variables}>
              {holes.map((name) => (
                <Field
                  key={name}
                  label={name}
                  value={variables[name] ?? ''}
                  placeholder="Value for this test run"
                  onChange={(event) =>
                    setVariables((current) => ({ ...current, [name]: event.target.value }))
                  }
                />
              ))}
            </div>
          )}

          <Button pending={testing} onClick={() => onTest(variables)}>
            <Play size={14} aria-hidden="true" />
            Run
          </Button>

          {result && <ResultView result={result} />}
        </div>
      )}

      {canWrite && (
        <div className={styles.formActions}>
          <Button variant="danger" pending={deleting} onClick={onDelete}>
            Delete endpoint
          </Button>
          <Button variant="primary" pending={saving} onClick={save}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
