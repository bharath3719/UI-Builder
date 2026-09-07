import { useNavigate } from 'react-router';
import { LogOut } from 'lucide-react';
import { useAuth } from '../auth/context.js';
import { useTheme, type ThemePreference } from '../hooks/useTheme.js';
import { initialsOf } from '../lib/text.js';
import {
  Menu,
  MenuCheckItem,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '../ui/Menu.js';
import styles from './AppBar.module.css';

/** The check mark carries the state, so these rows need no icon of their own. */
const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * The account menu: who you are, how the studio should look, and the way out. Theme
 * lives here rather than in the toolbar because it is set once and then forgotten —
 * a permanent toolbar slot would be a permanent distraction (§8).
 */
export function UserMenu() {
  const { user, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleSignOut() {
    await signOut();
    void navigate('/login', { replace: true });
  }

  return (
    <Menu>
      <MenuTrigger className={styles.avatar} title={`${user.name} · ${user.email}`}>
        {initialsOf(user.name, user.email)}
      </MenuTrigger>

      <MenuContent align="end">
        <div className={styles.identity}>
          <span className={styles.identityName}>{user.name}</span>
          <span className={styles.identityEmail}>{user.email}</span>
        </div>

        <MenuSeparator />

        {THEMES.map((theme) => (
          <MenuCheckItem
            key={theme.value}
            checked={preference === theme.value}
            // Radix would otherwise close the menu, which makes comparing the three
            // options a three-trip exercise.
            onSelect={(event) => {
              event.preventDefault();
              setPreference(theme.value);
            }}
          >
            {theme.label}
          </MenuCheckItem>
        ))}

        <MenuSeparator />

        <MenuItem icon={<LogOut size={14} />} onSelect={() => void handleSignOut()}>
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
