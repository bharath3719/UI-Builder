/**
 * A zip archive from the generated files, in memory — the delivery half of PLAN.md §11.
 *
 * Written here rather than pulled in, for the reason `ir.ts` formats its own output: both
 * the studio's download button and the API's export route have to produce the *same*
 * archive, and the way to guarantee that is for there to be one implementation with no
 * version of anything to drift. It is also what keeps this package's promise — nothing in
 * it reads a file, opens a socket or looks at a clock.
 *
 * Entries are stored, not deflated. An exported project is a dozen small text files; the
 * compression would save a few tens of kilobytes on a download that is already instant,
 * in exchange for the only part of a zip writer that is hard to get right.
 */

import type { ProjectDoc } from '@ui-builder/schema';
import { generateProject, packageSlug, type GenerateOptions, type VirtualFile } from './project.js';

/**
 * A fixed modification time — 1980-01-01T00:00, the DOS epoch a zip's date fields are
 * counted from.
 *
 * The clock is deliberately not read. `generateProject` is pure and a test asserts that
 * the same document produces the same bytes; an archive stamped with "now" would make
 * that false for the one artifact a user actually receives, and would mean two exports of
 * an unchanged project could never be compared.
 */
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

/** Bit 11: the file name is UTF-8. Without it a non-ASCII path decodes as code page 437. */
const UTF8_FLAG = 0x0800;

const STORED = 0;
const VERSION_NEEDED = 20;
/** Unix (3) + zip 2.0, so `external attributes` below is read as a file mode. */
const VERSION_MADE_BY = (3 << 8) | VERSION_NEEDED;
/** `0100644` — a regular, non-executable file. Otherwise unzip invents a mode. */
const EXTERNAL_ATTRIBUTES = (0o100644 << 16) >>> 0;

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

const CRC_TABLE = /* @__PURE__ */ (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: Uint8Array;
  data: Uint8Array;
  crc: number;
  /** Where this entry's local header starts, which the central directory points at. */
  offset: number;
}

/**
 * The files as a zip archive.
 *
 * Entry order is the order given, and `generateProject` emits in a fixed order, so two
 * archives of the same document are byte-identical.
 */
export function zipArchive(files: VirtualFile[]): Uint8Array {
  const encoder = new TextEncoder();

  const entries: Entry[] = files.map((file) => {
    const data = encoder.encode(file.contents);
    return { name: encoder.encode(file.path), data, crc: crc32(data), offset: 0 };
  });

  let size = 22;
  for (const entry of entries) {
    size += 30 + entry.name.length + entry.data.length;
    size += 46 + entry.name.length;
  }

  const buffer = new Uint8Array(size);
  const view = new DataView(buffer.buffer);
  let at = 0;

  const u16 = (value: number) => {
    view.setUint16(at, value, true);
    at += 2;
  };
  const u32 = (value: number) => {
    view.setUint32(at, value, true);
    at += 4;
  };
  const bytes = (value: Uint8Array) => {
    buffer.set(value, at);
    at += value.length;
  };

  for (const entry of entries) {
    entry.offset = at;
    u32(LOCAL_HEADER);
    u16(VERSION_NEEDED);
    u16(UTF8_FLAG);
    u16(STORED);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(entry.crc);
    // Stored, so the compressed and uncompressed sizes are the same number.
    u32(entry.data.length);
    u32(entry.data.length);
    u16(entry.name.length);
    u16(0); // extra field
    bytes(entry.name);
    bytes(entry.data);
  }

  const directoryOffset = at;

  for (const entry of entries) {
    u32(CENTRAL_HEADER);
    u16(VERSION_MADE_BY);
    u16(VERSION_NEEDED);
    u16(UTF8_FLAG);
    u16(STORED);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(entry.crc);
    u32(entry.data.length);
    u32(entry.data.length);
    u16(entry.name.length);
    u16(0); // extra field
    u16(0); // comment
    u16(0); // disk the entry starts on
    u16(0); // internal attributes
    u32(EXTERNAL_ATTRIBUTES);
    u32(entry.offset);
    bytes(entry.name);
  }

  // Measured before the record below is written: `at` is about to move, and the size
  // recorded here is the directory's, not the directory's plus part of this record.
  const directorySize = at - directoryOffset;

  u32(END_OF_CENTRAL_DIRECTORY);
  u16(0); // this disk
  u16(0); // the disk the directory starts on
  u16(entries.length);
  u16(entries.length);
  u32(directorySize);
  u32(directoryOffset);
  u16(0); // archive comment

  return buffer;
}

/**
 * A safe download name for a document: `my-site.zip`.
 *
 * The document's name is user input on its way into a `Content-Disposition` header and a
 * file system, so it goes through the same slug the package name does.
 */
export function zipFilename(slug: string): string {
  return `${slug}.zip`;
}

/**
 * The notes file an export carries when something did not survive the trip.
 *
 * A warning printed in the studio is gone the moment the tab is closed, and the person who
 * opens the zip a week later is often not the person who clicked the button. Written into
 * the archive it stays attached to the thing it is about.
 */
function notesFile(warnings: string[]): VirtualFile {
  return {
    path: 'EXPORT-NOTES.md',
    contents: `# Export notes

Some of this project did not make it into the code below.

${warnings.map((warning) => `- ${warning}`).join('\n')}

Everything else exported normally. Deleting this file changes nothing.
`,
  };
}

export interface ProjectArchive {
  /** `my-site.zip` — ready for a Content-Disposition header or a download attribute. */
  filename: string;
  bytes: Uint8Array;
  warnings: string[];
}

/**
 * A document to a downloadable archive — the one function both delivery paths call.
 *
 * The studio's download button and the API's export route go through here rather than
 * each composing `generateProject` with `zipArchive` themselves, so a change to what an
 * export contains cannot reach one of them and not the other. It is still pure, so the
 * browser and the server produce the same bytes for the same document.
 */
export function projectArchive(doc: ProjectDoc, options: GenerateOptions = {}): ProjectArchive {
  const { files, warnings } = generateProject(doc, options);
  const slug = options.packageName ?? packageSlug(doc.name);

  return {
    filename: zipFilename(slug),
    bytes: zipArchive(warnings.length === 0 ? files : [...files, notesFile(warnings)]),
    warnings,
  };
}
