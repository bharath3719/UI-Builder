import { useState } from 'react';
import {
  API_CONTENT_TYPES,
  type ApiAuth,
  type ApiAuthType,
  type ApiContentType,
  type ApiIntegrationSummary,
  type UpdateApiIntegrationRequest,
} from '@ui-builder/schema';
import { formErrorMessage, serverFieldErrors } from '../../lib/formErrors.js';
import { Button } from '../../ui/Button.js';
import { FormError } from '../../ui/Dialog.js';
import { Field } from '../../ui/Field.js';
import { headersFromRows, rowsFromHeaders, type HeaderRow } from './headers.js';
import { HeadersEditor } from './HeadersEditor.js';
import styles from './Integrations.module.css';

const AUTH_LABELS: Record<ApiAuthType, { label: string; hint: string }> = {
  none: { label: 'None', hint: 'A public API, or one that authenticates some other way.' },
  bearer: { label: 'Bearer token', hint: 'Sent as Authorization: Bearer <token>.' },
  apiKey: { label: 'API key', hint: 'Sent in a header or query parameter you name.' },
  basic: { label: 'Basic auth', hint: 'A username and password, base64 encoded.' },
};

const CONTENT_TYPE_LABELS: Record<ApiContentType, string> = {
  'application/json': 'JSON',
  'application/x-www-form-urlencoded': 'Form encoded',
  'text/plain': 'Plain text',
};

/**
 * Everything being edited, as one object.
 *
 * A draft rather than a field-per-`useState`: this form has ten controls and one Save, so
 * "has anything changed" and "what do I send" are questions about the whole thing. Held
 * here rather than derived from props on every render because a form the server has not
 * accepted yet is local state by definition.
 */
interface Draft {
  name: string;
  baseUrl: string;
  auth: ApiAuth;
  contentType: ApiContentType;
  headers: HeaderRow[];
  /**
   * Three-valued, matching the contract's `secret` exactly. Undefined is "leave it
   * alone", null is "clear it", a string is "replace it" — and the field is never
   * populated from the server, because the list response does not carry the token and
   * asking for it just to render dots would put a credential on the wire for no reason.
   */
  secret: string | null | undefined;
}

function draftFrom(integration: ApiIntegrationSummary): Draft {
  return {
    name: integration.name,
    baseUrl: integration.baseUrl,
    auth: integration.auth,
    contentType: integration.contentType,
    headers: rowsFromHeaders(integration.defaultHeaders),
    secret: undefined,
  };
}

/** A scheme change has to carry the fields that scheme needs, with something in them. */
function authOfType(type: ApiAuthType, current: ApiAuth): ApiAuth {
  if (type === current.type) return current;
  if (type === 'apiKey') return { type, in: 'header', name: 'X-Api-Key' };
  if (type === 'basic') return { type, username: '' };
  return { type };
}

export function ConnectionForm({
  integration,
  canWrite,
  onSave,
  onDelete,
  saveError,
  saving,
  deleting,
}: {
  integration: ApiIntegrationSummary;
  canWrite: boolean;
  onSave: (input: UpdateApiIntegrationRequest) => void;
  onDelete: () => void;
  saveError: unknown;
  saving: boolean;
  deleting: boolean;
}) {
  /**
   * Selecting a different connection reloads the form by *remounting* it — the caller
   * renders this with `key={integration.id}`. An effect that reset the draft when the id
   * changed would be the same behaviour written twice, and the version that runs after a
   * render is the version that briefly shows the previous connection's values.
   */
  const [draft, setDraft] = useState<Draft>(() => draftFrom(integration));

  const fieldErrors = serverFieldErrors(saveError);

  function patch(changes: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  function save() {
    onSave({
      name: draft.name,
      baseUrl: draft.baseUrl,
      auth: draft.auth,
      contentType: draft.contentType,
      defaultHeaders: headersFromRows(draft.headers),
      ...(draft.secret === undefined ? {} : { secret: draft.secret }),
    });
  }

  const auth = draft.auth;

  return (
    <div className={styles.form}>
      {formErrorMessage(saveError) && <FormError>{formErrorMessage(saveError)}</FormError>}

      <Field
        label="Name"
        value={draft.name}
        disabled={!canWrite}
        onChange={(event) => patch({ name: event.target.value })}
        error={fieldErrors.name}
      />

      <Field
        label="Base URL"
        value={draft.baseUrl}
        disabled={!canWrite}
        placeholder="https://api.example.com/v1"
        onChange={(event) => patch({ baseUrl: event.target.value })}
        error={fieldErrors.baseUrl}
        hint="Every endpoint's path is joined onto this."
      />

      <div className={styles.field}>
        <label className={styles.label} htmlFor="connection-auth">
          Authentication
        </label>
        <select
          id="connection-auth"
          className={styles.select}
          value={auth.type}
          disabled={!canWrite}
          onChange={(event) => patch({ auth: authOfType(event.target.value as ApiAuthType, auth) })}
        >
          {Object.entries(AUTH_LABELS).map(([type, { label }]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
        <span className={styles.hint}>{AUTH_LABELS[auth.type].hint}</span>
      </div>

      {auth.type === 'apiKey' && (
        <div className={styles.pair}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="apikey-in">
              Send it in
            </label>
            <select
              id="apikey-in"
              className={styles.select}
              value={auth.in}
              disabled={!canWrite}
              onChange={(event) =>
                patch({ auth: { ...auth, in: event.target.value as 'header' | 'query' } })
              }
            >
              <option value="header">A header</option>
              <option value="query">A query parameter</option>
            </select>
          </div>

          <Field
            label={auth.in === 'header' ? 'Header name' : 'Parameter name'}
            value={auth.name}
            disabled={!canWrite}
            placeholder={auth.in === 'header' ? 'X-Api-Key' : 'api_key'}
            onChange={(event) => patch({ auth: { ...auth, name: event.target.value } })}
          />
        </div>
      )}

      {auth.type === 'basic' && (
        <Field
          label="Username"
          value={auth.username}
          disabled={!canWrite}
          onChange={(event) => patch({ auth: { ...auth, username: event.target.value } })}
        />
      )}

      {auth.type !== 'none' && (
        <div className={styles.secretRow}>
          <Field
            label={auth.type === 'basic' ? 'Password' : 'Token'}
            type="password"
            autoComplete="off"
            value={draft.secret ?? ''}
            disabled={!canWrite || draft.secret === null}
            placeholder={
              integration.hasSecret && draft.secret === undefined
                ? '••••••••  (stored — type to replace)'
                : 'Paste it here'
            }
            onChange={(event) => patch({ secret: event.target.value })}
            error={fieldErrors.secret}
            hint={
              draft.secret === null
                ? 'Will be removed when you save.'
                : // The exposure this product accepted, said where the decision is made
                  // rather than only in a plan file. See PLAN.md's note on the call path.
                  'Stored encrypted. Sent to the browser when a page runs a query against this connection.'
            }
          />

          {integration.hasSecret && canWrite && (
            <Button
              variant="ghost"
              onClick={() => patch({ secret: draft.secret === null ? undefined : null })}
            >
              {draft.secret === null ? 'Keep it' : 'Remove'}
            </Button>
          )}
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="connection-content-type">
          Request body format
        </label>
        <select
          id="connection-content-type"
          className={styles.select}
          value={draft.contentType}
          disabled={!canWrite}
          onChange={(event) => patch({ contentType: event.target.value as ApiContentType })}
        >
          {API_CONTENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {CONTENT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <span className={styles.hint}>Used as the Content-Type on endpoints that send a body.</span>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Default headers</span>
        <HeadersEditor
          rows={draft.headers}
          onChange={(headers) => patch({ headers })}
          disabled={!canWrite}
          hint="Sent on every endpoint. An endpoint naming the same header overrides it."
        />
      </div>

      {canWrite && (
        <div className={styles.formActions}>
          <Button variant="danger" pending={deleting} onClick={onDelete}>
            Delete connection
          </Button>
          <Button variant="primary" pending={saving} onClick={save}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
