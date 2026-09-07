/**
 * Where a `showToast` step lands.
 *
 * Styled inline rather than through the theme, and deliberately: a toast is not part of
 * the design — nothing in the document describes it, the inspector cannot select it, and
 * a page whose own CSS restyled it would be a page that could hide its own errors. The
 * export emits an equivalent of this file rather than importing one, for the same reason
 * every other emitted module is written out in full (`components/runtime.ts`).
 *
 * Nothing renders while editing, since actions do not run there.
 */

import type { Toast } from './runtime.js';

export function Toasts({ toasts }: { toasts: readonly Toast[] }) {
  if (toasts.length === 0) return null;

  return (
    <div
      // `polite`, so a toast is announced after whatever the user was doing rather than
      // interrupting it — the same courtesy the visual version extends by appearing in a
      // corner.
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        insetInlineEnd: 16,
        insetBlockEnd: 16,
        zIndex: 2147483647,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            maxWidth: 320,
            padding: '10px 14px',
            borderRadius: 6,
            background: 'hsl(224 14% 16%)',
            color: 'hsl(0 0% 100%)',
            font: '13px/1.4 system-ui, sans-serif',
            boxShadow: '0 6px 20px hsl(224 14% 16% / 0.28)',
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
