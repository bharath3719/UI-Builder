import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import styles from './Menu.module.css';

/**
 * Radix supplies the behaviour a menu has to get right — focus trapping, typeahead,
 * arrow keys, collision-aware placement, closing on outside pointerdown — and none of
 * the appearance (§8). This module is the whole styling surface for every menu in the
 * studio, so they cannot drift apart.
 */

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({
  children,
  align = 'start',
  sideOffset = 4,
  className,
  ...rest
}: DropdownMenu.DropdownMenuContentProps) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        {...rest}
        align={align}
        sideOffset={sideOffset}
        // Merged rather than replaced: a caller passing a class is widening this menu
        // or giving it a scroll region, not restyling it.
        className={[styles.content, className].filter(Boolean).join(' ')}
        // The studio suppresses text selection globally; a menu opened by a drag-prone
        // trigger should not leave the pointer mid-gesture.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export interface MenuItemProps extends DropdownMenu.DropdownMenuItemProps {
  icon?: React.ReactNode;
  /** Right-aligned trailing text — a keyboard shortcut or a count. */
  detail?: React.ReactNode;
  /** Renders in the danger colour. For destructive actions only. */
  danger?: boolean;
}

export function MenuItem({ icon, detail, danger, children, ...rest }: MenuItemProps) {
  return (
    <DropdownMenu.Item
      {...rest}
      className={[styles.item, danger && styles.danger].filter(Boolean).join(' ')}
    >
      {icon && (
        <span className={styles.itemIcon} aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
      {detail && <span className={styles.itemDetail}>{detail}</span>}
    </DropdownMenu.Item>
  );
}

/** For a set of mutually exclusive choices — the theme picker, a workspace list. */
export function MenuCheckItem({
  checked,
  children,
  ...rest
}: DropdownMenu.DropdownMenuCheckboxItemProps) {
  return (
    <DropdownMenu.CheckboxItem {...rest} checked={checked} className={styles.item}>
      <span className={styles.check} aria-hidden="true">
        {checked === true && <Check size={14} strokeWidth={2.5} />}
      </span>
      {children}
    </DropdownMenu.CheckboxItem>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className={styles.separator} />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <DropdownMenu.Label className={styles.label}>{children}</DropdownMenu.Label>;
}
