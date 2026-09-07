import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronDown, Plus } from 'lucide-react';
import type { WorkspaceSummary } from '@ui-builder/schema';
import { useWorkspaces } from '../api/queries.js';
import { titleCase } from '../lib/text.js';
import {
  Menu,
  MenuCheckItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '../ui/Menu.js';
import { NewWorkspaceDialog } from '../workspace/NewWorkspaceDialog.js';
import styles from './AppBar.module.css';

/**
 * Switches workspace and creates new ones. Navigation is by slug, which is why slugs
 * are validated against a reserved list — `/w/new` must never be ambiguous.
 */
export function WorkspaceSwitcher({ current }: { current: WorkspaceSummary }) {
  const { data: workspaces = [] } = useWorkspaces();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <Menu>
        <MenuTrigger className={styles.trigger}>
          <span className={styles.triggerLabel}>{current.name}</span>
          <ChevronDown className={styles.chevron} size={14} aria-hidden="true" />
        </MenuTrigger>

        <MenuContent>
          <MenuLabel>Workspaces</MenuLabel>

          {/* A check rather than a disabled row: "you are here" and "you may not go
              there" should not look the same. */}
          {workspaces.map((workspace) => (
            <MenuCheckItem
              key={workspace.id}
              checked={workspace.id === current.id}
              onSelect={() => void navigate(`/w/${workspace.slug}`)}
            >
              <span className={styles.workspaceRow}>
                <span className={styles.workspaceName}>{workspace.name}</span>
                <span className={styles.workspaceMeta}>
                  {titleCase(workspace.role)} ·{' '}
                  {workspace.projectCount === 1
                    ? '1 project'
                    : `${workspace.projectCount} projects`}
                </span>
              </span>
            </MenuCheckItem>
          ))}

          <MenuSeparator />

          <MenuItem icon={<Plus size={14} />} onSelect={() => setCreating(true)}>
            New workspace
          </MenuItem>
        </MenuContent>
      </Menu>

      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
