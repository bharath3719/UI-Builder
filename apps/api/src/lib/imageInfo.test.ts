/**
 * The headers are built by hand rather than loaded from fixture files.
 *
 * A checked-in `.png` proves the parser reads that one picture; a constructed header says
 * what the parser believes the format *is*, which is the thing that can be wrong. It also
 * keeps the awkward cases — a JPEG whose frame sits behind three other segments, a WebP in
 * each of its three flavours — expressible at all.
 */

import { describe, expect, it } from 'vitest';
import { imageInfo } from './imageInfo.js';

function bytes(...parts: (number | number[] | string)[]): Uint8Array {
  const flat: number[] = [];
  for (const part of parts) {
    if (typeof part === 'string') flat.push(...[...part].map((char) => char.charCodeAt(0)));
    else if (Array.isArray(part)) flat.push(...part);
    else flat.push(part);
  }
  return new Uint8Array(flat);
}

const be16 = (value: number) => [(value >> 8) & 0xff, value & 0xff];
const be32 = (value: number) => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];
const le16 = (value: number) => [value & 0xff, (value >> 8) & 0xff];
const le24 = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('imageInfo', () => {
  it('reads a PNG', () => {
    const file = bytes(PNG_SIGNATURE, be32(13), 'IHDR', be32(1024), be32(768));
    expect(imageInfo(file)).toEqual({ mimeType: 'image/png', width: 1024, height: 768 });
  });

  it('reads a GIF, whose size is little-endian', () => {
    const file = bytes('GIF89a', le16(320), le16(200));
    expect(imageInfo(file)).toEqual({ mimeType: 'image/gif', width: 320, height: 200 });
  });

  it('walks past a JPEG segment to reach the frame', () => {
    // An APP0 block of its own length sits in front, which is what makes the frame's
    // position a thing to compute rather than a constant.
    const app0 = bytes(0xff, 0xe0, be16(16), 'JFIF', [0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
    const sof0 = bytes(0xff, 0xc0, be16(17), 8, be16(600), be16(800));
    const file = bytes(0xff, 0xd8, [...app0], [...sof0]);

    // Height precedes width in a JPEG frame, which is the one place that order is not
    // width-then-height and therefore the one place it gets written backwards.
    expect(imageInfo(file)).toEqual({ mimeType: 'image/jpeg', width: 800, height: 600 });
  });

  it('reads a progressive JPEG, whose frame marker is not SOF0', () => {
    const sof2 = bytes(0xff, 0xc2, be16(17), 8, be16(50), be16(60));
    expect(imageInfo(bytes(0xff, 0xd8, [...sof2]))).toEqual({
      mimeType: 'image/jpeg',
      width: 60,
      height: 50,
    });
  });

  it('does not mistake a Huffman table for a frame', () => {
    // 0xC4 is inside the frame-marker range and is not a frame. Reading it as one gives a
    // size out of the table's contents — plausible-looking numbers, silently wrong.
    const dht = bytes(0xff, 0xc4, be16(6), [0, 1, 2, 3]);
    const sof0 = bytes(0xff, 0xc0, be16(17), 8, be16(10), be16(20));
    expect(imageInfo(bytes(0xff, 0xd8, [...dht], [...sof0]))).toEqual({
      mimeType: 'image/jpeg',
      width: 20,
      height: 10,
    });
  });

  it('reads each of the three WebP flavours', () => {
    // Three bytes of frame tag and the three-byte start code sit between the chunk header
    // and the dimensions.
    const lossy = bytes(
      'RIFF',
      be32(0),
      'WEBP',
      'VP8 ',
      be32(0),
      [0, 0, 0],
      [0x9d, 0x01, 0x2a],
      le16(300),
      le16(150),
    );
    expect(imageInfo(lossy)).toEqual({ mimeType: 'image/webp', width: 300, height: 150 });

    // Lossless packs both dimensions into 28 bits, each stored one less than it is.
    const packed = (400 - 1) | ((250 - 1) << 14);
    const lossless = bytes('RIFF', be32(0), 'WEBP', 'VP8L', be32(0), 0x2f, [
      packed & 0xff,
      (packed >> 8) & 0xff,
      (packed >> 16) & 0xff,
      (packed >> 24) & 0xff,
    ]);
    expect(imageInfo(lossless)).toEqual({ mimeType: 'image/webp', width: 400, height: 250 });

    const extended = bytes(
      'RIFF',
      be32(0),
      'WEBP',
      'VP8X',
      be32(10),
      [0, 0, 0, 0],
      le24(1920 - 1),
      le24(1080 - 1),
    );
    expect(imageInfo(extended)).toEqual({ mimeType: 'image/webp', width: 1920, height: 1080 });
  });

  it('finds an AVIF size in its ispe box', () => {
    const file = bytes(
      be32(24),
      'ftyp',
      'avif',
      be32(0),
      'avif',
      'mif1',
      be32(20),
      'ispe',
      be32(0),
      be32(640),
      be32(480),
    );
    expect(imageInfo(file)).toEqual({ mimeType: 'image/avif', width: 640, height: 480 });
  });

  it('still accepts a recognised file it cannot measure', () => {
    // The type is the security answer and the size is a convenience; a truncated PNG is
    // still a PNG, and the contract makes the dimensions nullable for exactly this.
    expect(imageInfo(bytes(PNG_SIGNATURE))).toEqual({
      mimeType: 'image/png',
      width: null,
      height: null,
    });
  });

  it('reports no size rather than a zero', () => {
    const file = bytes(PNG_SIGNATURE, be32(13), 'IHDR', be32(0), be32(0));
    expect(imageInfo(file)).toEqual({ mimeType: 'image/png', width: null, height: null });
  });

  it('refuses an SVG, which is a document and can carry script', () => {
    expect(imageInfo(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });

  it('refuses HTML wearing an image name', () => {
    expect(imageInfo(bytes('<!doctype html><script>alert(1)</script>'))).toBeNull();
  });

  it('refuses an empty file', () => {
    expect(imageInfo(new Uint8Array())).toBeNull();
  });

  it('refuses a file whose signature is almost right', () => {
    // One byte out of the PNG signature. Recognising this would mean recognising anything
    // whose first byte matched, which is most files.
    expect(imageInfo(bytes([0x89, 0x50, 0x4e, 0x48, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
  });
});
