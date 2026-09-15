/**
 * What a file actually is, read from its own bytes.
 *
 * The declared `Content-Type` of an upload is a claim by whoever is uploading, so it is
 * worth nothing as a check: an endpoint that stores what the client says it is storing is
 * an endpoint that stores anything. Every accepted type here has a signature in its first
 * few bytes, so recognising it *is* the validation — and the same parse hands back the
 * dimensions, which the canvas wants anyway and which a client could otherwise lie about.
 *
 * Hand-rolled rather than `image-size` or `sharp`, for `zip.ts`'s reason: this is a few
 * dozen lines of header reading against formats that have not changed in twenty years, and
 * the alternative is a dependency in the request path of an upload endpoint.
 *
 * Dimensions are best-effort and the contract says so (`width`/`height` are nullable). The
 * *type* is not: a file whose bytes match nothing here is refused.
 */

import type { AssetMimeType } from '@ui-builder/schema';

export interface ImageInfo {
  mimeType: AssetMimeType;
  width: number | null;
  height: number | null;
}

/** Whether `bytes` begins with `signature` from `at`. */
function startsWith(bytes: Uint8Array, signature: readonly number[], at = 0): boolean {
  if (bytes.length < at + signature.length) return false;
  return signature.every((byte, index) => bytes[at + index] === byte);
}

/** The four ASCII characters at an offset — a box or chunk name. */
function tag(bytes: Uint8Array, at: number): string {
  if (bytes.length < at + 4) return '';
  return String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
}

function u16be(bytes: Uint8Array, at: number): number {
  return (bytes[at]! << 8) | bytes[at + 1]!;
}

function u32be(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at]! << 24) >>> 0) + (bytes[at + 1]! << 16) + (bytes[at + 2]! << 8) + bytes[at + 3]!
  );
}

function u16le(bytes: Uint8Array, at: number): number {
  return bytes[at]! | (bytes[at + 1]! << 8);
}

/** PNG: an 8-byte signature, then IHDR carrying the size at a fixed offset. */
function png(bytes: Uint8Array): ImageInfo | null {
  if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return null;
  if (bytes.length < 24) return { mimeType: 'image/png', width: null, height: null };

  return { mimeType: 'image/png', width: u32be(bytes, 16), height: u32be(bytes, 20) };
}

/** GIF: 'GIF87a' or 'GIF89a', then the logical screen size, little-endian. */
function gif(bytes: Uint8Array): ImageInfo | null {
  if (tag(bytes, 0) !== 'GIF8') return null;
  if (bytes.length < 10) return { mimeType: 'image/gif', width: null, height: null };

  return { mimeType: 'image/gif', width: u16le(bytes, 6), height: u16le(bytes, 8) };
}

/**
 * JPEG: a segment chain, and the size lives in whichever start-of-frame marker turns up.
 *
 * Walked rather than indexed because the frame is preceded by any number of application,
 * quantisation and comment segments, and their sizes are what say where the next one is.
 */
function jpeg(bytes: Uint8Array): ImageInfo | null {
  if (!startsWith(bytes, [0xff, 0xd8])) return null;

  const found: ImageInfo = { mimeType: 'image/jpeg', width: null, height: null };
  let at = 2;

  // Enough for a marker and its length. What a *frame* needs is checked where it is read:
  // requiring the larger amount here walks off the end of a file whose frame is its last
  // segment, which is every JPEG with no thumbnail.
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) break;

    const marker = bytes[at + 1]!;
    // Standalone markers carry no length, so there is nothing to skip over.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    // Start of scan: the entropy-coded data begins and there is no frame header after it.
    if (marker === 0xda) break;

    const length = u16be(bytes, at + 2);
    if (length < 2) break;

    // Every start-of-frame except DHT (0xc4), DAC (0xcc) and the restart markers.
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isFrame) {
      if (at + 9 > bytes.length) return found;
      return { ...found, height: u16be(bytes, at + 5), width: u16be(bytes, at + 7) };
    }

    at += 2 + length;
  }

  return found;
}

/** WebP: a RIFF container whose size lives in whichever VP8 flavour it holds. */
function webp(bytes: Uint8Array): ImageInfo | null {
  if (tag(bytes, 0) !== 'RIFF' || tag(bytes, 8) !== 'WEBP') return null;

  const found: ImageInfo = { mimeType: 'image/webp', width: null, height: null };
  const kind = tag(bytes, 12);

  // Lossy: a 3-byte start code, then 14-bit dimensions with the top two bits as scaling.
  if (kind === 'VP8 ' && bytes.length >= 30) {
    return { ...found, width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
  }

  // Lossless: 14-bit dimensions packed across four bytes, each stored one less than it is.
  if (kind === 'VP8L' && bytes.length >= 25) {
    const packed = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    return {
      ...found,
      width: (packed & 0x3fff) + 1,
      height: ((packed >> 14) & 0x3fff) + 1,
    };
  }

  // Extended: 24-bit dimensions, little-endian, each stored one less than it is.
  if (kind === 'VP8X' && bytes.length >= 30) {
    const width = bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16);
    const height = bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16);
    return { ...found, width: width + 1, height: height + 1 };
  }

  return found;
}

/**
 * AVIF: an ISO base media file, recognised by its brand.
 *
 * The dimensions live in an `ispe` box nested four levels down (meta → iprp → ipco → ispe).
 * Rather than walk that tree, this scans the header region for the box directly — the same
 * bargain the other parsers strike, and the reason `width`/`height` are nullable: a file
 * whose `ispe` sits past the window is stored, just without a measurement.
 */
function avif(bytes: Uint8Array): ImageInfo | null {
  if (tag(bytes, 4) !== 'ftyp') return null;

  const brand = tag(bytes, 8);
  if (brand !== 'avif' && brand !== 'avis') return null;

  const found: ImageInfo = { mimeType: 'image/avif', width: null, height: null };
  // The last offset at which a whole `ispe` — name, version and two dimensions — still
  // fits, so a box that ends exactly at the end of the window is still found.
  const limit = Math.min(bytes.length - 16, 4096);

  for (let at = 8; at <= limit; at += 1) {
    if (tag(bytes, at) === 'ispe') {
      // 4 bytes of version and flags sit between the box name and the dimensions.
      return { ...found, width: u32be(bytes, at + 8), height: u32be(bytes, at + 12) };
    }
  }

  return found;
}

const PARSERS = [png, jpeg, gif, webp, avif];

/**
 * What this file is, or null when it is nothing this project accepts.
 *
 * Null is the whole security answer for an upload: a `.png` that is really a script, an
 * HTML file renamed, or an SVG (excluded on purpose — see `ASSET_MIME_TYPES`) all land
 * here and are refused, whatever the request said they were.
 */
export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  for (const parse of PARSERS) {
    const found = parse(bytes);
    if (found) {
      // A parser that recognised the format but read a nonsense size reports no size at
      // all rather than a zero the canvas would try to lay out.
      const width = found.width !== null && found.width > 0 ? found.width : null;
      const height = found.height !== null && found.height > 0 ? found.height : null;
      return { mimeType: found.mimeType, width, height };
    }
  }

  return null;
}
