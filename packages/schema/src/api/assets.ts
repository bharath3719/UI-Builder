import { z } from 'zod';
import { Id } from './common.js';

/**
 * What a project may store, and what the studio will draw.
 *
 * A closed list rather than "anything beginning with image/", because an upload endpoint
 * that accepts whatever the browser claims is one that stores whatever an attacker sends.
 * SVG is deliberately absent: it is a document, not a picture — it can carry script, and
 * anything serving it from an origin that matters is serving script from that origin.
 */
export const ASSET_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
] as const;

export const AssetMimeType = z.enum(ASSET_MIME_TYPES);
export type AssetMimeType = z.infer<typeof AssetMimeType>;

/** The extension an object key takes for each type — never the uploaded filename's. */
export const ASSET_EXTENSIONS: Record<AssetMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * 10 MB.
 *
 * Enforced on both sides and meant differently in each: the studio uses it to say no
 * without spending someone's upload, and the API uses it because the studio's copy is a
 * courtesy that anything can skip.
 */
export const ASSET_MAX_BYTES = 10 * 1024 * 1024;

export const AssetSummary = z.object({
  id: Id,
  projectId: Id,
  /**
   * Where the bytes are, as the document stores it and an exported project fetches it.
   *
   * Absolute and unsigned, which is the decision worth knowing: a presigned URL expires,
   * and a document is long-lived, so every stored reference would rot — and an export
   * handed to someone else would arrive with dead images. So the bucket serves these
   * objects publicly and this is their public address. What is *private* is the project
   * that references them; the bytes of a page someone published were always going to be
   * fetchable by anyone with the link.
   */
  url: z.url(),
  mimeType: AssetMimeType,
  /** Read from the file's own header, so a lying client cannot mis-size the canvas. */
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  bytes: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type AssetSummary = z.infer<typeof AssetSummary>;
