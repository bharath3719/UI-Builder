import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  hasAtLeast,
  REQUIRES,
  type ApiEndpointSummary,
  type ApiIntegrationSummary,
  type WorkspaceSummary,
} from '@ui-builder/schema';
import {
  useCreateEndpoint,
  useCreateIntegration,
  useDeleteEndpoint,
  useDeleteIntegration,
  useIntegrations,
  useTestEndpoint,
  useUpdateEndpoint,
  useUpdateIntegration,
} from '../../api/queries.js';
import { formErrorMessage } from '../../lib/formErrors.js';
import { Button } from '../../ui/Button.js';
import { Dialog, DialogClose, FormError } from '../../ui/Dialog.js';
import { Spinner } from '../../ui/Spinner.js';
import { ConnectionForm } from './ConnectionForm.js';
import { EndpointEditor } from './EndpointEditor.js';
import styles from './Integrations.module.css';

/**
 * What the detail pane is showing.
 *
 * One selection rather than two independent ones, because "a connection" and "an endpoint
 * on it" are alternatives in the same pane, not a pair. Holding both would allow the
 * state where an endpoint is selected under a connection that is not, which the tree on
 * the left could not draw.
 */
type Selection =
  | { kind: 'connection'; integrationId: string }
  | { kind: 'endpoint'; integrationId: string; endpointId: string };

function isSameIntegration(selection: Selection | null, integrationId: string): boolean {
  return selection?.integrationId === integrationId;
}

/**
 * The workspace's API connections, and the calls defined on them.
 *
 * Open to every member, like the members dialog: someone building a page needs to see
 * what is available even when they may not change it, and a screen that refuses to open
 * teaches nothing. The role gates the editing controls and the server enforces it.
 */
export function IntegrationsDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: WorkspaceSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const integrations = useIntegrations(open ? workspace.id : undefined);

  const create = useCreateIntegration(workspace.id);
  const update = useUpdateIntegration(workspace.id);
  const remove = useDeleteIntegration(workspace.id);
  const addEndpoint = useCreateEndpoint(workspace.id);
  const saveEndpoint = useUpdateEndpoint(workspace.id);
  const removeEndpoint = useDeleteEndpoint(workspace.id);
  const test = useTestEndpoint(workspace.id);

  const [selection, setSelection] = useState<Selection | null>(null);

  const canWrite = hasAtLeast(workspace.role, REQUIRES.integrationWrite);
  const list = integrations.data ?? [];

  /**
   * The selection is *resolved* here rather than repaired in an effect.
   *
   * It can outlive what it points at — a connection deleted in this dialog, or one
   * someone else removed between fetches — and the tempting fix is an effect that clears
   * it. That is a cascading render (and this repo's lint rejects it), and it is also
   * unnecessary: a selection that does not resolve simply renders as no selection, and
   * the next click replaces it. The stale value sitting in state harms nothing.
   *
   * It gives the right fallback for free, too: an endpoint that has been deleted leaves
   * `integration` resolved and `endpoint` undefined, which is the connection form — the
   * pane you would want to land on.
   */
  const integration: ApiIntegrationSummary | undefined = list.find(
    (one) => one.id === selection?.integrationId,
  );
  const endpoint: ApiEndpointSummary | undefined =
    selection?.kind === 'endpoint'
      ? integration?.endpoints.find((one) => one.id === selection.endpointId)
      : undefined;

  function createConnection() {
    create.mutate(
      { name: 'New connection', baseUrl: 'https://api.example.com', auth: { type: 'none' } },
      { onSuccess: (made) => setSelection({ kind: 'connection', integrationId: made.id }) },
    );
  }

  function createEndpointOn(integrationId: string) {
    addEndpoint.mutate(
      { integrationId, input: { name: 'New endpoint', method: 'GET', path: '/' } },
      {
        onSuccess: (made) => setSelection({ kind: 'endpoint', integrationId, endpointId: made.id }),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      title="API integrations"
      description={`Connections to outside APIs that every project in ${workspace.name} can use.`}
      footer={
        <DialogClose asChild>
          <Button>Done</Button>
        </DialogClose>
      }
    >
      <div className={styles.layout}>
        <div className={styles.sidebar}>
          {integrations.isPending ? (
            <div className={styles.loading}>
              <Spinner size={18} label="Loading integrations" />
            </div>
          ) : integrations.isError ? (
            <FormError>{formErrorMessage(integrations.error)}</FormError>
          ) : list.length === 0 ? (
            <p className={styles.empty}>
              No connections yet. Add one to call an API from your pages.
            </p>
          ) : (
            <ul className={styles.tree}>
              {list.map((one) => (
                <li key={one.id}>
                  <button
                    type="button"
                    className={[
                      styles.treeConnection,
                      selection?.kind === 'connection' &&
                        isSameIntegration(selection, one.id) &&
                        styles.treeOn,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSelection({ kind: 'connection', integrationId: one.id })}
                  >
                    <span className={styles.treeName}>{one.name}</span>
                    <span className={styles.treeUrl}>{one.baseUrl}</span>
                  </button>

                  <ul className={styles.treeEndpoints}>
                    {one.endpoints.map((call) => (
                      <li key={call.id}>
                        <button
                          type="button"
                          className={[
                            styles.treeEndpoint,
                            selection?.kind === 'endpoint' &&
                              selection.endpointId === call.id &&
                              styles.treeOn,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() =>
                            setSelection({
                              kind: 'endpoint',
                              integrationId: one.id,
                              endpointId: call.id,
                            })
                          }
                        >
                          <span className={styles.method} data-method={call.method}>
                            {call.method}
                          </span>
                          <span className={styles.treeName}>{call.name}</span>
                        </button>
                      </li>
                    ))}

                    {canWrite && (
                      <li>
                        <button
                          type="button"
                          className={styles.treeAdd}
                          disabled={addEndpoint.isPending}
                          onClick={() => createEndpointOn(one.id)}
                        >
                          <Plus size={13} aria-hidden="true" />
                          Add endpoint
                        </button>
                      </li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          {canWrite && (
            <Button block pending={create.isPending} onClick={createConnection}>
              <Plus size={14} aria-hidden="true" />
              New connection
            </Button>
          )}
        </div>

        <div className={styles.detail}>
          {integration === undefined ? (
            <p className={styles.placeholder}>Select a connection or an endpoint to edit it.</p>
          ) : endpoint === undefined ? (
            <ConnectionForm
              /*
               * Keyed on the timestamp as well as the id, so a successful save reloads the
               * form from what the server now holds.
               *
               * Found by driving it: after saving a token, the field kept the typed value
               * and went on offering "Paste it here" rather than "stored — type to
               * replace", because the id had not changed and nothing else reset the draft.
               * Remounting is the whole fix, and it is the same mechanism the id already
               * relies on rather than a second one.
               */
              key={`${integration.id}:${integration.updatedAt}`}
              integration={integration}
              canWrite={canWrite}
              saveError={update.error}
              saving={update.isPending}
              deleting={remove.isPending}
              onSave={(input) => update.mutate({ id: integration.id, input })}
              onDelete={() => remove.mutate(integration.id)}
            />
          ) : (
            <EndpointEditor
              /*
               * Keyed on the id alone, unlike the connection form.
               *
               * A test run bumps `updatedAt` (it writes the sample), so keying on that
               * would remount the editor at the exact moment someone has typed values into
               * the test form and pressed Run — clearing the inputs that produced the
               * result now on screen. It is also unnecessary: nothing here mirrors server
               * state into a draft the way the token field does, and the sample the picker
               * draws is read straight from props.
               */
              key={endpoint.id}
              integration={integration}
              endpoint={endpoint}
              canWrite={canWrite}
              saveError={saveEndpoint.error}
              saving={saveEndpoint.isPending}
              deleting={removeEndpoint.isPending}
              testing={test.isPending}
              // Cleared whenever the selection moves, because a result shown under a
              // different endpoint than the one that produced it is a lie.
              result={
                test.data && test.variables?.endpointId === endpoint.id ? test.data : undefined
              }
              onSave={(input) =>
                saveEndpoint.mutate({
                  integrationId: integration.id,
                  endpointId: endpoint.id,
                  input,
                })
              }
              onDelete={() =>
                removeEndpoint.mutate({
                  integrationId: integration.id,
                  endpointId: endpoint.id,
                })
              }
              onTest={(variables) =>
                test.mutate({
                  integrationId: integration.id,
                  endpointId: endpoint.id,
                  input: { variables, save: true },
                })
              }
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}
