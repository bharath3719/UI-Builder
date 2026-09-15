/**
 * Materialises a generated project on disk, so it can be installed and built.
 *
 * The snapshot tests prove the output is *stable*; they cannot prove it *compiles*. This
 * is the other half of Phase 10's acceptance criterion — "produces a zip that runs with
 * `npm i && npm run dev`" — and it stays in the repo because a pinned dependency in
 * `project.ts` going stale is exactly the kind of rot that is invisible until someone
 * downloads an export.
 *
 *   npx tsx packages/codegen/scripts/emit.mts <out-dir> [--doc demo|interactive|symbols|slots|powerbi] [--zip <file>]
 *
 * `--doc interactive` is the Phase 11 fixture — state, queries, handlers, a repeat and a
 * condition. It is the one that proves the generated *code* compiles rather than only the
 * generated markup, which is the half `tsc` in the export's own build script checks.
 *
 * `--doc symbols` is Phase 12's: two components, one placing the other, props of every
 * shape, an instance styled at its placement and a component rendered once per row of a
 * request. `tsc` there checks the part a snapshot cannot — that the props interface, the
 * parameter defaults and the class the component is handed all line up.
 *
 * `--doc powerbi` is the integration fixture: a DAX query whose rows arrive as
 * `Record<string, unknown>` and are then read by a repeat and a table. It is the only one
 * that carries connections, because an integration query's request is not written down in
 * the document — see `powerbiIntegrations`.
 *
 * `--zip` writes the same files through `zipArchive` as well, so the archive can be
 * opened by a real unzip program. A zip reader written alongside a zip writer agrees with
 * it by construction; only another implementation is evidence.
 *
 * The directory is emptied first: a stale file from a previous run is how a build passes
 * against code that is no longer generated.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { generateProject } from '../src/project.js';
import { zipArchive } from '../src/zip.js';
import {
  demoDoc,
  interactiveDoc,
  powerbiDoc,
  powerbiIntegrations,
  slotDoc,
  symbolDoc,
} from '../src/fixtures.js';

const out = resolve(process.argv[2] ?? 'export-demo');

const DOCS = {
  demo: { doc: demoDoc },
  interactive: { doc: interactiveDoc },
  symbols: { doc: symbolDoc },
  // Slots are their own fixture rather than part of `symbols`, and they have to be their
  // own entry here for the same reason: the three branches a slot takes — a fallback, a
  // bare `{children}`, a placement that passes content — only differ in the *generated
  // component's* signature, which is precisely what a snapshot cannot judge and `tsc` can.
  slots: { doc: slotDoc },
  // The one fixture with connections behind it. A generator handed none drops the query
  // and warns, so omitting these would emit a page that compiles and fetches nothing.
  powerbi: { doc: powerbiDoc, integrations: powerbiIntegrations },
} as const;

const docFlag = process.argv.indexOf('--doc');
const which = (docFlag === -1 ? 'demo' : process.argv[docFlag + 1]) as keyof typeof DOCS;
const chosen = DOCS[which] ?? DOCS.demo;

const { files, warnings } = generateProject(chosen.doc(), {
  ...('integrations' in chosen ? { integrations: chosen.integrations() } : {}),
});

await rm(out, { recursive: true, force: true });

for (const file of files) {
  const target = join(out, file.path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, file.contents, 'utf8');
}

const zipFlag = process.argv.indexOf('--zip');
if (zipFlag !== -1) {
  const target = resolve(process.argv[zipFlag + 1]!);
  await writeFile(target, zipArchive(files));
  console.log(`archive -> ${target}`);
}

console.log(`${files.length} files -> ${out}`);
for (const warning of warnings) console.log(`  warning: ${warning}`);
