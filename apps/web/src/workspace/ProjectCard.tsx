import { useState } from 'react';
import { Link } from 'react-router';
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { hasAtLeast, REQUIRES, type ProjectSummary, type Role } from '@ui-builder/schema';
import { useUpdateProject } from '../api/queries.js';
import { relativeDay } from '../lib/text.js';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/Menu.js';
import { DeleteProjectDialog } from './DeleteProjectDialog.js';
import { RenameProjectDialog } from './RenameProjectDialog.js';
import styles from './WorkspaceRoute.module.css';

/**
 * One project in the grid.
 *
 * Actions are hidden from roles that cannot perform them, using the same capability
 * table the API enforces with (`REQUIRES`). Offering a viewer a Delete that answers 403
 * would be a worse experience than not offering it — and the check is shared, so the
 * two cannot drift.
 */
export function ProjectCard({
  project,
  role,
  onChanged,
}: {
  project: ProjectSummary;
  role: Role;
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const update = useUpdateProject(project);

  const canWrite = hasAtLeast(role, REQUIRES.projectWrite);
  const canDelete = hasAtLeast(role, REQUIRES.projectDelete);
  const archived = project.archivedAt !== null;

  function setArchived(next: boolean) {
    update.mutate({ archived: next }, { onSuccess: onChanged });
  }

  return (
    <article className={[styles.card, archived && styles.cardArchived].filter(Boolean).join(' ')}>
      <Link to={`/p/${project.id}`} className={styles.thumb} aria-label={`Open ${project.name}`}>
        {project.thumbnailUrl ? (
          <img className={styles.thumbImage} src={project.thumbnailUrl} alt="" />
        ) : (
          <span className={styles.thumbEmpty}>No preview yet</span>
        )}
      </Link>

      <div className={styles.cardFooter}>
        <span className={styles.cardText}>
          <Link to={`/p/${project.id}`} className={styles.cardName}>
            {project.name}
          </Link>
          <span className={styles.cardMeta}>
            {archived ? (
              <span className={styles.archived}>Archived</span>
            ) : (
              `Edited ${relativeDay(project.updatedAt)}`
            )}
          </span>
        </span>

        {(canWrite || canDelete) && (
          <Menu>
            <MenuTrigger
              className={styles.rowMenu}
              title={`Actions for ${project.name}`}
              aria-label={`Actions for ${project.name}`}
            >
              <MoreHorizontal size={16} />
            </MenuTrigger>

            <MenuContent align="end">
              {canWrite && (
                <>
                  <MenuItem icon={<Pencil size={14} />} onSelect={() => setRenaming(true)}>
                    Rename
                  </MenuItem>
                  <MenuItem
                    icon={archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    onSelect={() => setArchived(!archived)}
                  >
                    {archived ? 'Restore' : 'Archive'}
                  </MenuItem>
                </>
              )}

              {canWrite && canDelete && <MenuSeparator />}

              {canDelete && (
                <MenuItem danger icon={<Trash2 size={14} />} onSelect={() => setDeleting(true)}>
                  Delete
                </MenuItem>
              )}
            </MenuContent>
          </Menu>
        )}
      </div>

      <RenameProjectDialog
        project={project}
        open={renaming}
        onOpenChange={setRenaming}
        onRenamed={onChanged}
      />

      <DeleteProjectDialog
        project={project}
        open={deleting}
        onOpenChange={setDeleting}
        onDeleted={onChanged}
      />
    </article>
  );
}
