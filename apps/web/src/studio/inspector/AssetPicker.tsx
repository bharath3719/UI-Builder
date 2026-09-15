import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { ASSET_MAX_BYTES, ASSET_MIME_TYPES, type AssetSummary } from '@ui-builder/schema';
import { useAssets, useDeleteAsset, useUploadAsset } from '../../api/queries.js';
import { formErrorMessage } from '../../lib/formErrors.js';
import { Button } from '../../ui/Button.js';
import { Dialog, DialogClose, FormError } from '../../ui/Dialog.js';
import { Spinner } from '../../ui/Spinner.js';
import { useStudio } from '../state/context.js';
import styles from './AssetPicker.module.css';

const ACCEPT = ASSET_MIME_TYPES.join(',');
const MAX_MB = Math.floor(ASSET_MAX_BYTES / 1024 / 1024);

/** 4.2 kB, 1.3 MB — the size someone recognises from their own file listing. */
function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The project's uploaded images, and a way to add one.
 *
 * It writes a **URL** into whatever prop opened it, not an asset id. That is the decision
 * worth recording: the document would be smaller with an id, but every other reader of it
 * — the preview, the exported project, a shared link opened by someone with no account —
 * would then need a way to resolve one, and the export would ship pointing at this API
 * rather than at the image. A URL is already what `src` means everywhere it is going.
 *
 * The cost is that deleting an asset cannot rewrite the nodes that used it, so a deleted
 * image leaves a broken reference. That is why the delete says so before it happens.
 */
export function AssetPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (url: string) => void;
}) {
  const { projectId, writable } = useStudio();
  const assets = useAssets(open ? projectId : undefined);
  const upload = useUploadAsset(projectId);
  const remove = useDeleteAsset(projectId);

  const fileInput = useRef<HTMLInputElement>(null);
  const [tooBig, setTooBig] = useState<string>();

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    // Checked here as well as on the server, and meant differently in each: this one saves
    // someone a minute of uploading before being told no. The server's is the real rule.
    if (file.size > ASSET_MAX_BYTES) {
      setTooBig(`${file.name} is ${readableSize(file.size)} — the limit is ${MAX_MB} MB.`);
      return;
    }

    setTooBig(undefined);
    upload.mutate(file, { onSuccess: (asset) => onPick(asset.url) });
  }

  const failure = tooBig ?? formErrorMessage(upload.error) ?? formErrorMessage(remove.error);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Images"
      description={`PNG, JPEG, GIF, WebP or AVIF, up to ${MAX_MB} MB.`}
      footer={
        <DialogClose asChild>
          <Button>Done</Button>
        </DialogClose>
      }
    >
      {failure && <FormError>{failure}</FormError>}

      {writable && (
        <div className={styles.upload}>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className={styles.fileInput}
            onChange={(event) => {
              handleFiles(event.target.files);
              // Cleared so choosing the same file twice in a row still fires a change.
              event.target.value = '';
            }}
          />
          <Button
            variant="primary"
            pending={upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={14} aria-hidden="true" />
            Upload an image
          </Button>
        </div>
      )}

      {assets.isPending ? (
        <div className={styles.loading}>
          <Spinner size={18} label="Loading images" />
        </div>
      ) : assets.isError ? (
        <FormError>{formErrorMessage(assets.error)}</FormError>
      ) : assets.data.length === 0 ? (
        <p className={styles.empty}>
          <ImagePlus size={16} aria-hidden="true" />
          Nothing uploaded yet.
        </p>
      ) : (
        <ul className={styles.grid}>
          {assets.data.map((asset) => (
            <AssetTile
              key={asset.id}
              asset={asset}
              writable={writable}
              onPick={() => onPick(asset.url)}
              onRemove={() => remove.mutate(asset.id)}
            />
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function AssetTile({
  asset,
  writable,
  onPick,
  onRemove,
}: {
  asset: AssetSummary;
  writable: boolean;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <li className={styles.tile}>
      <button type="button" className={styles.pick} onClick={onPick}>
        <img className={styles.thumb} src={asset.url} alt="" loading="lazy" />
        <span className={styles.meta}>
          {asset.width && asset.height ? `${asset.width}×${asset.height}` : asset.mimeType}
          <span className={styles.size}>{readableSize(asset.bytes)}</span>
        </span>
      </button>

      {writable && (
        <Button
          variant="ghost"
          iconOnly
          className={styles.remove}
          title="Delete this image"
          aria-label="Delete this image"
          onClick={() => {
            // Asked, because a node that used this image keeps its URL and will simply
            // stop loading — see the note on `AssetPicker`. Nothing here can find those
            // nodes, so the warning is the only honest thing to offer.
            if (window.confirm('Delete this image? Anything using it will stop showing it.')) {
              onRemove();
            }
          }}
        >
          <Trash2 size={13} aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}
