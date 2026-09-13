import { ASSET_MAX_BYTES, type AssetSummary, type AssetMimeType } from '@ui-builder/schema';
import type { Db } from '../../db/client.js';
import type { ProjectAccess } from '../../lib/access.js';
import { NotFoundError, UnavailableError, ValidationError } from '../../lib/errors.js';
import { imageInfo } from '../../lib/imageInfo.js';
import { assetKey, type StorageDriver } from '../../lib/storage.js';

/**
 * Uploaded files — PLAN.md §12.
 *
 * The driver is passed in rather than reached for, exactly as `db` is: it is built once by
 * the `storage` plugin, and taking it as an argument is what lets a test drive these
 * functions without a bucket, a network or credentials.
 */
function requireStorage(storage: StorageDriver | null): StorageDriver {
  if (!storage) {
    throw new UnavailableError(
      'This deployment has no object storage configured, so files cannot be uploaded. ' +
        'Set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY to enable it.',
    );
  }
  return storage;
}

interface AssetRow {
  id: string;
  projectId: string;
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  bytes: number;
  createdAt: Date;
}

/**
 * A stored row as the contract's shape.
 *
 * `mimeType` is cast rather than parsed. The column is a string and the enum is the
 * contract's, and every row was written by `uploadAsset` below, which only ever stores
 * what `imageInfo` recognised — so the set of values in the column is exactly the enum.
 */
function toSummary(row: AssetRow): AssetSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    url: row.url,
    mimeType: row.mimeType as AssetMimeType,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAssets(db: Db, access: ProjectAccess): Promise<AssetSummary[]> {
  const rows = await db.asset.findMany({
    where: { projectId: access.project.id },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map(toSummary);
}

/**
 * Stores a file and records it.
 *
 * The order is load-bearing: the bytes go to the object store first, and the row is
 * written only once they are there. The other way round leaves a row pointing at nothing
 * whenever an upload fails — a broken image in someone's design that no retry fixes,
 * because as far as the database is concerned it succeeded. This way a failure leaves an
 * orphaned object instead, which costs storage and breaks nothing.
 *
 * Nothing the client said about the file is trusted. The type comes from the bytes
 * (`imageInfo`), the size is measured here, and the key is built from ids — so a request
 * claiming `image/png` for a script, or a filename of `../../etc/passwd`, has nowhere to
 * put either claim.
 */
export async function uploadAsset(
  db: Db,
  storage: StorageDriver | null,
  access: ProjectAccess,
  file: Uint8Array,
): Promise<AssetSummary> {
  const driver = requireStorage(storage);

  if (file.byteLength === 0) {
    throw new ValidationError([{ path: 'file', message: 'is empty' }]);
  }

  if (file.byteLength > ASSET_MAX_BYTES) {
    throw new ValidationError([
      {
        path: 'file',
        message: `is larger than ${Math.floor(ASSET_MAX_BYTES / 1024 / 1024)} MB`,
      },
    ]);
  }

  const info = imageInfo(file);
  if (!info) {
    throw new ValidationError([
      {
        path: 'file',
        message: 'is not a PNG, JPEG, GIF, WebP or AVIF image',
      },
    ]);
  }

  // The id is generated before the upload because it is part of the key. Taking it from
  // the row instead would mean writing the row first, which is the ordering above exists
  // to avoid.
  const id = crypto.randomUUID().replace(/-/g, '');
  const key = assetKey(access.project.id, id, info.mimeType);

  await driver.put(key, file, info.mimeType);

  const row = await db.asset.create({
    data: {
      id,
      projectId: access.project.id,
      url: driver.publicUrl(key),
      mimeType: info.mimeType,
      width: info.width,
      height: info.height,
      bytes: file.byteLength,
    },
  });

  return toSummary(row);
}

/**
 * Forgets a file, and deletes its bytes.
 *
 * The row goes first here, which is the mirror of the upload's order and the same
 * reasoning: what must never happen is a row pointing at bytes that are gone. A delete
 * that removes the row and then fails to remove the object leaves an orphan nobody can
 * see, which is the survivable half.
 */
export async function deleteAsset(
  db: Db,
  storage: StorageDriver | null,
  access: ProjectAccess,
  assetId: string,
): Promise<void> {
  const row = await db.asset.findUnique({ where: { id: assetId } });

  // Scoped to the project the caller was granted access to, so an id from another project
  // is a 404 here rather than a delete. The membership check happened on the project.
  if (!row || row.projectId !== access.project.id) {
    throw new NotFoundError('That asset');
  }

  await db.asset.delete({ where: { id: assetId } });

  const driver = requireStorage(storage);
  await driver.remove(assetKey(access.project.id, assetId, row.mimeType as AssetMimeType));
}
