import { Spinner } from './Spinner.js';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  /** Square, for a lone icon. Requires `title` or `aria-label` — icons carry tooltips (§8). */
  iconOnly?: boolean;
  block?: boolean;
  /** Swaps the label for a spinner and disables the button, without changing its width. */
  pending?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  iconOnly = false,
  block = false,
  pending = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    size === 'lg' && styles.lg,
    iconOnly && styles.icon,
    block && styles.block,
    pending && styles.pending,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button {...rest} type={type} className={classes} disabled={disabled || pending}>
      {children}
      {pending && (
        <span className={styles.pendingSpinner}>
          <Spinner size={size === 'lg' ? 15 : 13} />
        </span>
      )}
    </button>
  );
}
