import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Trash2 } from 'lucide-react';
import {
  Email,
  hasAtLeast,
  outranks,
  REQUIRES,
  Role,
  type WorkspaceMemberSummary,
  type WorkspaceSummary,
} from '@ui-builder/schema';
import { useAddMember, useMembers, useRemoveMember, useUpdateMemberRole } from '../api/queries.js';
import { useAuth } from '../auth/context.js';
import { formErrorMessage, serverFieldErrors } from '../lib/formErrors.js';
import { Button } from '../ui/Button.js';
import { Dialog, DialogClose, FormError } from '../ui/Dialog.js';
import { Field } from '../ui/Field.js';
import { Spinner } from '../ui/Spinner.js';
import styles from './MembersDialog.module.css';

/**
 * What each role is called, and what it lets someone do.
 *
 * The second half is the point: `EDITOR` and `VIEWER` are not self-explanatory, and a
 * dropdown of four bare words is a decision someone makes by guessing. The capability
 * table in `schema/api/roles.ts` is what actually enforces these, so the sentences here
 * describe it rather than restating it in a second place that could drift.
 */
const ROLE_LABELS: Record<Role, { label: string; hint: string }> = {
  OWNER: { label: 'Owner', hint: 'Everything, including deleting the workspace' },
  ADMIN: { label: 'Admin', hint: 'Manage members and every project' },
  EDITOR: { label: 'Editor', hint: 'Create and edit projects' },
  VIEWER: { label: 'Viewer', hint: 'Open projects, change nothing' },
};

const ROLES = Role.options;

/**
 * One member, with whatever this viewer is allowed to do to them.
 *
 * The two permissions are deliberately different questions, and they are the server's own
 * (`workspaces.updateMemberRole` / `removeMember`). Changing a role needs `workspaceManage`
 * *and* outranking the target, so an admin cannot promote themselves past the owner.
 * Removing needs one or the other: you may always act on yourself, which is what makes
 * "leave this workspace" the same control rather than a second one.
 */
function MemberRow({
  member,
  workspace,
  isSelf,
  onLeft,
}: {
  member: WorkspaceMemberSummary;
  workspace: WorkspaceSummary;
  isSelf: boolean;
  onLeft: () => void;
}) {
  const updateRole = useUpdateMemberRole(workspace.id);
  // Leaving unmounts this row before the request settles, so the handler is given to the
  // hook rather than to `mutate` — see `useRemoveMember`.
  const remove = useRemoveMember(workspace.id, isSelf ? onLeft : undefined);

  const manages = hasAtLeast(workspace.role, REQUIRES.workspaceManage);
  const canChangeRole = manages && outranks(workspace.role, member.role);
  const canRemove = isSelf || (manages && outranks(workspace.role, member.role));

  const failure = formErrorMessage(updateRole.error) ?? formErrorMessage(remove.error);

  return (
    <li className={styles.row}>
      <div className={styles.who}>
        <span className={styles.name}>
          {member.name}
          {isSelf && <span className={styles.you}>you</span>}
        </span>
        <span className={styles.email}>{member.email}</span>
        {failure && (
          <span className={styles.rowError} role="alert">
            {failure}
          </span>
        )}
      </div>

      {canChangeRole ? (
        <select
          className={styles.role}
          value={member.role}
          aria-label={`Role for ${member.name}`}
          disabled={updateRole.isPending}
          onChange={(event) =>
            updateRole.mutate({ memberId: member.id, role: event.target.value as Role })
          }
        >
          {ROLES.map((role) => (
            // Only roles this viewer outranks: offering one the server will refuse is a
            // control that looks available and is not.
            <option key={role} value={role} disabled={!outranks(workspace.role, role)}>
              {ROLE_LABELS[role].label}
            </option>
          ))}
        </select>
      ) : (
        <span className={styles.roleStatic} title={ROLE_LABELS[member.role].hint}>
          {ROLE_LABELS[member.role].label}
        </span>
      )}

      <Button
        variant={isSelf ? 'secondary' : 'ghost'}
        iconOnly={!isSelf}
        disabled={!canRemove}
        pending={remove.isPending}
        title={isSelf ? 'Leave this workspace' : `Remove ${member.name}`}
        aria-label={isSelf ? 'Leave this workspace' : `Remove ${member.name}`}
        onClick={() => remove.mutate(member.id)}
      >
        {isSelf ? 'Leave' : <Trash2 size={14} aria-hidden="true" />}
      </Button>
    </li>
  );
}

/**
 * Who is in a workspace, and who may change that.
 *
 * Open to every member rather than to admins only: a viewer needs to know who to ask for
 * access, and leaving is something anyone must be able to do without help. What the role
 * gates is the invite form and the per-row controls, which is the same line the server
 * draws — this decides what to *offer*, and the server still decides what to allow.
 */
export function MembersDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: WorkspaceSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const members = useMembers(open ? workspace.id : undefined);
  const add = useAddMember(workspace.id);
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('EDITOR');
  const [emailError, setEmailError] = useState<string>();

  const manages = hasAtLeast(workspace.role, REQUIRES.workspaceManage);

  function close(next: boolean) {
    if (!next) {
      setEmail('');
      setEmailError(undefined);
      add.reset();
    }
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = Email.safeParse(email.trim());
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? 'is not an email address');
      return;
    }

    setEmailError(undefined);
    add.mutate({ email: parsed.data, role }, { onSuccess: () => setEmail('') });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Members"
      description={`Who can open ${workspace.name}, and what they can do in it.`}
      {...(manages ? { onSubmit: handleSubmit } : {})}
      footer={
        <DialogClose asChild>
          <Button>Done</Button>
        </DialogClose>
      }
    >
      {members.isPending ? (
        <div className={styles.loading}>
          <Spinner size={18} label="Loading members" />
        </div>
      ) : members.isError ? (
        <FormError>{formErrorMessage(members.error)}</FormError>
      ) : (
        <ul className={styles.list}>
          {members.data.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              workspace={workspace}
              isSelf={member.userId === user?.id}
              onLeft={() => {
                close(false);
                void navigate('/');
              }}
            />
          ))}
        </ul>
      )}

      {manages && (
        <div className={styles.invite}>
          {formErrorMessage(add.error) && <FormError>{formErrorMessage(add.error)}</FormError>}

          <div className={styles.inviteRow}>
            <Field
              label="Invite by email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="someone@example.com"
              error={emailError ?? serverFieldErrors(add.error).email}
              // No invitation email is sent — Phase 1's decision, and the contract says so
              // on `AddMemberRequest`. Saying it here is what stops someone waiting for one.
              hint="They need an account already; no email is sent."
            />

            <label className={styles.inviteRole}>
              <span className={styles.inviteRoleLabel}>Role</span>
              <select
                className={styles.role}
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                {ROLES.filter((candidate) => outranks(workspace.role, candidate)).map(
                  (candidate) => (
                    <option key={candidate} value={candidate}>
                      {ROLE_LABELS[candidate].label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <Button type="submit" variant="primary" pending={add.isPending}>
              Invite
            </Button>
          </div>

          <p className={styles.roleHint}>{ROLE_LABELS[role].hint}</p>
        </div>
      )}
    </Dialog>
  );
}
