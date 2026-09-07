import { Link } from 'react-router';
import type { WorkspaceSummary } from '@ui-builder/schema';
import { UserMenu } from './UserMenu.js';
import { WorkspaceSwitcher } from './WorkspaceSwitcher.js';
import styles from './AppBar.module.css';

/**
 * The bar above everything outside the editor. The editor has its own top bar instead
 * (`studio/topbar`), because there the row has to carry canvas controls and cannot
 * afford to also carry navigation chrome.
 */
export function AppBar({ workspace }: { workspace?: WorkspaceSummary }) {
  return (
    <header className={styles.bar}>
      <Link to="/" className={styles.wordmark}>
        UI Builder
      </Link>

      {workspace && (
        <>
          <span className={styles.divider} aria-hidden="true" />
          <WorkspaceSwitcher current={workspace} />
        </>
      )}

      <span className={styles.spacer} />

      <UserMenu />
    </header>
  );
}
