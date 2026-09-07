/**
 * Up to two initials for an avatar. Falls back through name → email → `?`, because
 * every account has an email even if the name is somehow blank.
 */
export function initialsOf(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words.at(0);
  const last = words.at(-1);

  if (first && last && words.length >= 2) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
  }

  return ((first ?? email).slice(0, 2) || '?').toUpperCase();
}

/** "Owner" from "OWNER" — roles are shouted in the contract, not in the UI. */
export function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/**
 * A relative day for a project's "edited" line. Deliberately coarse: the exact minute
 * is never what the grid is being scanned for, and a live-updating "3 minutes ago"
 * would be motion for its own sake (§8).
 */
export function relativeDay(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);

  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;

  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
