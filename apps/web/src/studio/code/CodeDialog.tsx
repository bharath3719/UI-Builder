import { useEffect, useMemo, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Check, Copy, Download, X } from 'lucide-react';
import { generateProject, projectArchive, type VirtualFile } from '@ui-builder/codegen';
import type { ProjectDoc } from '@ui-builder/schema';
import { Button } from '../../ui/Button.js';
import styles from './CodeDialog.module.css';

/** How long the copy button stays confirmed before offering the action again. */
const COPIED_MS = 1800;

/**
 * Which file opens first.
 *
 * The page component, not `package.json`: someone opening this panel wants to see what
 * their design became, and the scaffold is the least interesting file in the archive.
 */
function firstFile(files: VirtualFile[]): string {
  return files.find((file) => file.path.startsWith('src/pages/'))?.path ?? files[0]?.path ?? '';
}

function lineCount(contents: string): number {
  // A file ending in a newline has no empty last line to number.
  const lines = contents.split('\n');
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

function FileList({
  files,
  selected,
  onSelect,
}: {
  files: VirtualFile[];
  selected: string;
  onSelect: (path: string) => void;
}) {
  return (
    <nav className={styles.files} aria-label="Generated files">
      {files.map((file) => (
        <button
          key={file.path}
          type="button"
          className={styles.file}
          data-selected={file.path === selected ? '' : undefined}
          onClick={() => onSelect(file.path)}
        >
          {file.path}
        </button>
      ))}
    </nav>
  );
}

/**
 * The generated project, read-only — PLAN.md §11.
 *
 * Generated in the browser from the document on screen, by the same `generateProject` the
 * API's export route calls. That is the point of the function being pure: the panel is not
 * an approximation of the download, it is the download.
 *
 * It reads the *live* document rather than the saved one, unlike preview and a shared
 * link. A code panel is a way of understanding what the thing you are editing compiles to,
 * and one that lagged a second behind the canvas would be answering a question nobody
 * asked. The download follows the same rule for the same reason — and because the access
 * token lives in memory only, a plain link to the API route could not carry it anyway.
 */
export function CodeDialog({
  doc,
  open,
  onOpenChange,
}: {
  doc: ProjectDoc;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Only while the dialog is open: regenerating a whole project on every keystroke behind
  // a closed panel is work nobody is looking at.
  const project = useMemo(
    () => (open ? generateProject(doc) : { files: [], warnings: [] }),
    [doc, open],
  );

  // Derived rather than corrected in an effect: the selection is a *preference*, and the
  // file it names may not exist in this render (a page renamed, the panel just opened).
  // Falling back here means there is no moment where the panel points at nothing.
  const path =
    selected && project.files.some((file) => file.path === selected)
      ? selected
      : firstFile(project.files);

  const file = project.files.find((entry) => entry.path === path);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.contents);
      setCopied(true);
    } catch {
      // No clipboard permission, or an insecure origin. The text is on screen and
      // selectable, which is one keystroke from the same result.
    }
  };

  const download = () => {
    const archive = projectArchive(doc);
    // A fresh copy of the bytes: `Blob` will not take a view onto a buffer it does not own
    // the whole of, and the archive is a plain `Uint8Array`.
    const url = URL.createObjectURL(
      new Blob([archive.bytes.slice().buffer], { type: 'application/zip' }),
    );

    const link = document.createElement('a');
    link.href = url;
    link.download = archive.filename;
    link.click();

    // The browser has already read the URL synchronously; revoking now frees the blob
    // rather than leaving it held for the life of the tab.
    URL.revokeObjectURL(url);
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.scrim} />
        <RadixDialog.Content className={styles.content} aria-describedby={undefined}>
          <header className={styles.header}>
            <RadixDialog.Title className={styles.title}>Code</RadixDialog.Title>
            <span className={styles.subtitle}>
              A Vite + React project, generated from this document
            </span>

            <span className={styles.spacer} />

            <Button type="button" onClick={() => void copy()} disabled={!file}>
              {copied ? (
                <Check size={13} aria-hidden="true" />
              ) : (
                <Copy size={13} aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy file'}
            </Button>

            <Button type="button" variant="primary" onClick={download}>
              <Download size={13} aria-hidden="true" />
              Download .zip
            </Button>

            <RadixDialog.Close asChild>
              <Button type="button" variant="ghost" iconOnly aria-label="Close">
                <X size={14} />
              </Button>
            </RadixDialog.Close>
          </header>

          {project.warnings.length > 0 && (
            <div className={styles.warnings} role="status">
              {project.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          <div className={styles.split}>
            <FileList files={project.files} selected={path} onSelect={setSelected} />

            <div className={styles.pane}>
              {file ? (
                <div className={styles.code}>
                  <pre className={styles.gutter} aria-hidden="true">
                    {Array.from({ length: lineCount(file.contents) }, (_, index) => index + 1).join(
                      '\n',
                    )}
                  </pre>
                  <pre className={styles.source}>
                    <code>{file.contents}</code>
                  </pre>
                </div>
              ) : (
                <p className={styles.empty}>Nothing to show.</p>
              )}
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
