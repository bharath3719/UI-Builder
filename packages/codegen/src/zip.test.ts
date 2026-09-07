import { describe, expect, test } from 'vitest';
import { bareDoc, demoDoc } from './fixtures.js';
import { generateProject } from './project.js';
import { crc32, projectArchive, zipArchive, zipFilename } from './zip.js';

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

/**
 * Reads an archive back the way an unzip program does — from the end of central directory
 * backwards — rather than by walking the local headers forwards.
 *
 * That order is the point: an archive whose local headers are perfect and whose central
 * directory is wrong opens fine in a forward-parsing test and fails in every real tool,
 * because the directory is the index they trust.
 */
function readArchive(archive: Uint8Array) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const decoder = new TextDecoder();

  const end = archive.length - 22;
  expect(view.getUint32(end, true)).toBe(END_OF_CENTRAL_DIRECTORY);

  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);
  expect(directoryOffset + directorySize).toBe(end);

  const files: { name: string; contents: string }[] = [];
  let at = directoryOffset;

  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(at, true)).toBe(CENTRAL_HEADER);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = decoder.decode(archive.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength;

    // Follow the directory's pointer into the local header, which is what makes a wrong
    // offset a failure here rather than a corrupt file someone finds later.
    expect(view.getUint32(localOffset, true)).toBe(LOCAL_HEADER);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const extraLength = view.getUint16(localOffset + 28, true);
    const localName = decoder.decode(
      archive.subarray(localOffset + 30, localOffset + 30 + localNameLength),
    );
    expect(localName).toBe(name);

    const start = localOffset + 30 + localNameLength + extraLength;
    const data = archive.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);

    files.push({ name, contents: decoder.decode(data) });
  }

  return files;
}

describe('crc32', () => {
  // The published check values for the CRC-32 used by zip, gzip and png.
  test('matches the standard vectors', () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    expect(crc32(encode(''))).toBe(0);
    expect(crc32(encode('a'))).toBe(0xe8b7be43);
    expect(crc32(encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });
});

describe('the archive', () => {
  test('reads back through its central directory', () => {
    const archive = zipArchive([
      { path: 'a.txt', contents: 'one' },
      { path: 'src/b.txt', contents: 'two' },
    ]);

    expect(readArchive(archive)).toEqual([
      { name: 'a.txt', contents: 'one' },
      { name: 'src/b.txt', contents: 'two' },
    ]);
  });

  test('carries a whole generated project', () => {
    const { files } = generateProject(demoDoc());
    const round = readArchive(zipArchive(files));

    expect(round.map((file) => file.name)).toEqual(files.map((file) => file.path));
    for (const [index, file] of files.entries()) {
      expect(round[index]!.contents).toBe(file.contents);
    }
  });

  test('stores non-ASCII content and paths byte-for-byte', () => {
    // A size written in characters rather than UTF-8 bytes is the classic zip bug: the
    // archive opens, and every file after the first is shifted by the difference.
    const files = [
      { path: 'héllo/naïve.txt', contents: 'Thinking… — ✓ 🎉' },
      { path: 'after.txt', contents: 'still here' },
    ];
    expect(readArchive(zipArchive(files))).toEqual(
      files.map((file) => ({ name: file.path, contents: file.contents })),
    );
  });

  test('an empty file is a valid entry', () => {
    expect(readArchive(zipArchive([{ path: 'empty', contents: '' }]))).toEqual([
      { name: 'empty', contents: '' },
    ]);
  });

  test('the same project zips to the same bytes', () => {
    const { files } = generateProject(demoDoc());
    expect(zipArchive(files)).toEqual(zipArchive(files));
  });
});

describe('zipFilename', () => {
  test('names the download after the slug', () => {
    expect(zipFilename('demo-project')).toBe('demo-project.zip');
  });
});

describe('projectArchive', () => {
  test('is named after the document and holds the generated project', () => {
    const archive = projectArchive(demoDoc());
    const names = readArchive(archive.bytes).map((file) => file.name);

    expect(archive.filename).toBe('demo-project.zip');
    expect(names).toContain('package.json');
    expect(names).toContain('src/pages/Home.tsx');
  });

  test('writes the warnings into the archive, where the person who unzips it will see them', () => {
    const archive = projectArchive(demoDoc());
    const notes = readArchive(archive.bytes).find((file) => file.name === 'EXPORT-NOTES.md');

    expect(archive.warnings).toHaveLength(1);
    expect(notes?.contents).toContain('Old carousel');
  });

  test('a clean export carries no notes file', () => {
    const archive = projectArchive(bareDoc());

    expect(archive.warnings).toEqual([]);
    expect(readArchive(archive.bytes).map((file) => file.name)).not.toContain('EXPORT-NOTES.md');
  });

  test('the archive the studio builds is the archive the server sends', () => {
    // Not a tautology: it is the reason both call this function rather than composing
    // `generateProject` with `zipArchive` themselves.
    expect(projectArchive(demoDoc()).bytes).toEqual(projectArchive(demoDoc()).bytes);
  });
});
