/**
 * Where uploaded bytes go — PLAN.md §12, "image/asset upload (S3-compatible)".
 *
 * An interface with one implementation, for the reason `EmitModule` is an interface with
 * two: the rest of the API should not know what a bucket is. The asset service puts a key
 * and gets back a URL; whether that went to AWS, R2 or MinIO is this file's business, and
 * a second driver later is an addition here rather than a change to a route.
 *
 * The driver is nullable on purpose. This repo runs with no third-party keys (D9), so a
 * checkout with no bucket configured has to boot — it simply cannot accept uploads, which
 * the routes say plainly rather than crashing on startup or failing mid-request.
 */

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ASSET_EXTENSIONS, type AssetMimeType } from '@ui-builder/schema';
import { env } from '../env.js';

export interface StorageDriver {
  /** Stores an object. Overwrites, because a key is only ever generated once. */
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Removes one. A key that is already gone is a success, not an error. */
  remove(key: string): Promise<void>;
  /** Where a browser reads this object — absolute, unsigned, and stored in documents. */
  publicUrl(key: string): string;
}

/**
 * The key an asset's bytes live under.
 *
 * The extension comes from what the bytes turned out to be, never from the uploaded
 * filename — the filename is attacker-controlled text and this is a path. The asset id is
 * the whole of the name for the same reason: no part of what someone typed reaches the
 * object store, so there is nothing to traverse, collide or overwrite with.
 */
export function assetKey(projectId: string, assetId: string, mimeType: AssetMimeType): string {
  return `projects/${projectId}/${assetId}.${ASSET_EXTENSIONS[mimeType]}`;
}

function s3Driver(bucket: string, client: S3Client, base: string): StorageDriver {
  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // These objects are immutable — a key is generated once and never rewritten —
          // so they can be cached for as long as anything is willing to keep them.
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    },

    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    publicUrl(key) {
      return `${base}/${key}`;
    },
  };
}

/**
 * The configured driver, or null when this deployment has no object storage.
 *
 * All four of bucket, key, secret and (for anything that is not AWS) endpoint have to be
 * present together. A half-configured store is the case worth catching loudly: it boots,
 * and then fails on the first upload someone tries, which is the worst time to find out.
 */
export function createStorage(): StorageDriver | null {
  const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT } = env;

  if (!S3_BUCKET && !S3_ACCESS_KEY_ID && !S3_SECRET_ACCESS_KEY) return null;

  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error(
      'Object storage is half-configured: S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY ' +
        'must be set together, or all left unset to run without uploads.',
    );
  }

  const client = new S3Client({
    region: env.S3_REGION,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    ...(S3_ENDPOINT ? { endpoint: S3_ENDPOINT, forcePathStyle: env.S3_FORCE_PATH_STYLE } : {}),
  });

  // Path style when the endpoint is a gateway, subdomain style on AWS — the same choice
  // the client above is given, made once more because the public address has to match how
  // the bucket is actually reachable.
  const base =
    env.S3_PUBLIC_URL ??
    (S3_ENDPOINT
      ? env.S3_FORCE_PATH_STYLE
        ? `${S3_ENDPOINT.replace(/\/$/, '')}/${S3_BUCKET}`
        : S3_ENDPOINT.replace('://', `://${S3_BUCKET}.`).replace(/\/$/, '')
      : `https://${S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`);

  return s3Driver(S3_BUCKET, client, base.replace(/\/$/, ''));
}
