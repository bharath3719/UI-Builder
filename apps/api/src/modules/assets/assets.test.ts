/**
 * Upload, list and delete — PLAN.md §12.
 *
 * The object store is a fake, substituted at `app.storage`, which is the seam the
 * `storage` plugin exists to provide. That is the honest boundary for this suite: what is
 * worth testing here is what the *API* does — that it refuses a file whose bytes are not
 * an image whatever the request claimed, that it will not write a row for bytes it failed
 * to store, that a viewer cannot upload and an outsider cannot look. Whether the AWS SDK
 * can talk to S3 is not something a test of this code can establish, and a test that
 * mocked the SDK's wire format would be asserting my idea of S3 rather than S3.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AssetSummary } from '@ui-builder/schema';
import { createTestApi, type TestApi, type TestUser } from '../../test/api.js';
import type { StorageDriver } from '../../lib/storage.js';

let api: TestApi;

/** Records what it was asked to do, and can be told to fail. */
function fakeStorage() {
  const objects = new Map<string, { bytes: number; contentType: string }>();
  let failNextPut = false;

  const driver: StorageDriver = {
    async put(key, body, contentType) {
      if (failNextPut) {
        failNextPut = false;
        throw new Error('the bucket said no');
      }
      objects.set(key, { bytes: body.byteLength, contentType });
    },
    async remove(key) {
      objects.delete(key);
    },
    publicUrl(key) {
      return `https://cdn.example.test/${key}`;
    },
  };

  return {
    driver,
    objects,
    failNextPut() {
      failNextPut = true;
    },
  };
}

let storage: ReturnType<typeof fakeStorage>;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A real, minimal PNG header carrying a size. */
function png(width: number, height: number): Buffer {
  const be32 = (value: number) => [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];

  return Buffer.from([
    ...PNG_SIGNATURE,
    ...be32(13),
    ...[...'IHDR'].map((c) => c.charCodeAt(0)),
    ...be32(width),
    ...be32(height),
  ]);
}

const BOUNDARY = '----uibuildertestboundary';

/** A multipart body with one file part, as a browser's `FormData` would send it. */
function multipart(contents: Buffer, filename = 'picture.png', type = 'image/png'): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\n` +
        `content-disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `content-type: ${type}\r\n\r\n`,
    ),
    contents,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

async function upload(user: TestUser, projectId: string, body: Buffer) {
  return api.post(`/api/projects/${projectId}/assets`, {
    as: user,
    body,
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
  });
}

/** A signed-in user with a workspace and a project in it. */
async function withProject(role?: 'VIEWER') {
  const owner = await api.register();
  const workspace = await api.post('/api/workspaces', { as: owner, body: { name: 'Space' } });
  const workspaceId = workspace.json<{ id: string }>().id;

  const project = await api.post(`/api/workspaces/${workspaceId}/projects`, {
    as: owner,
    body: { name: 'Site' },
  });
  const projectId = project.json<{ id: string }>().id;

  if (!role) return { owner, workspaceId, projectId, actor: owner };

  const guest = await api.register();
  await api.post(`/api/workspaces/${workspaceId}/members`, {
    as: owner,
    body: { email: guest.email, role },
  });

  return { owner, workspaceId, projectId, actor: guest };
}

beforeEach(async () => {
  api ??= await createTestApi();
  await api.reset();

  storage = fakeStorage();
  api.app.storage = storage.driver;
});

afterAll(async () => {
  await api?.close();
});

describe('uploading', () => {
  it('stores the bytes and records them', async () => {
    const { actor, projectId } = await withProject();
    const response = await upload(actor, projectId, multipart(png(800, 600)));

    expect(response.statusCode).toBe(201);

    const asset = response.json<AssetSummary>();
    expect(asset.mimeType).toBe('image/png');
    // Measured from the file's own header, so the canvas can size a placement before the
    // image has loaded — and so a client cannot claim a shape the picture does not have.
    expect(asset.width).toBe(800);
    expect(asset.height).toBe(600);
    expect(asset.url).toBe(`https://cdn.example.test/projects/${projectId}/${asset.id}.png`);

    expect([...storage.objects.keys()]).toEqual([`projects/${projectId}/${asset.id}.png`]);
  });

  it('refuses a file whose bytes are not an image, whatever the request said', async () => {
    // The declared content type is a claim by the uploader. This is the request an
    // endpoint that trusted it would store as `image/png` and serve back as script.
    const { actor, projectId } = await withProject();
    const script = Buffer.from('<!doctype html><script>alert(1)</script>');

    const response = await upload(actor, projectId, multipart(script, 'totally.png'));

    expect(response.statusCode).toBe(400);
    expect(
      response.json<{ error: { details: { message: string }[] } }>().error.details[0]?.message,
    ).toContain('not a PNG');
    expect(storage.objects.size).toBe(0);
  });

  it('refuses an SVG, which is a document that can carry script', async () => {
    const { actor, projectId } = await withProject();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');

    expect(
      (await upload(actor, projectId, multipart(svg, 'logo.svg', 'image/svg+xml'))).statusCode,
    ).toBe(400);
  });

  it('refuses an empty file', async () => {
    const { actor, projectId } = await withProject();
    expect((await upload(actor, projectId, multipart(Buffer.alloc(0)))).statusCode).toBe(400);
  });

  it('writes no row when the bytes could not be stored', async () => {
    // The ordering the service exists to get right. A row written first and an upload that
    // then failed is a broken image in someone's design that no retry fixes, because as
    // far as the database is concerned it worked.
    const { actor, projectId } = await withProject();
    storage.failNextPut();

    const response = await upload(actor, projectId, multipart(png(10, 10)));

    expect(response.statusCode).toBe(500);
    expect(await api.db.asset.count()).toBe(0);
  });

  it('names the object after ids only, never after the uploaded filename', async () => {
    // The filename is attacker-controlled text and the key is a path.
    const { actor, projectId } = await withProject();
    const response = await upload(
      actor,
      projectId,
      multipart(png(4, 4), '../../../etc/passwd%00.png'),
    );

    expect(response.statusCode).toBe(201);
    const key = [...storage.objects.keys()][0]!;
    expect(key).not.toContain('..');
    expect(key).toBe(`projects/${projectId}/${response.json<AssetSummary>().id}.png`);
  });

  it('says so when the deployment has no object storage', async () => {
    // A checkout with no bucket boots and works; it just cannot take uploads (D9). 503
    // rather than 500, because nothing went wrong and retrying will not help.
    const { actor, projectId } = await withProject();
    api.app.storage = null;

    const response = await upload(actor, projectId, multipart(png(4, 4)));

    expect(response.statusCode).toBe(503);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('unavailable');
  });
});

describe('access', () => {
  it('lets a viewer look but not upload', async () => {
    // The export route's rule: anyone who can open the studio can already see every image
    // in the design, so listing is VIEWER — but adding one changes what the project is.
    const { actor, projectId } = await withProject('VIEWER');

    expect((await api.get(`/api/projects/${projectId}/assets`, { as: actor })).statusCode).toBe(
      200,
    );
    expect((await upload(actor, projectId, multipart(png(4, 4)))).statusCode).toBe(403);
  });

  it('keeps a non-member out entirely', async () => {
    const { projectId } = await withProject();
    const stranger = await api.register();

    expect((await api.get(`/api/projects/${projectId}/assets`, { as: stranger })).statusCode).toBe(
      403,
    );
  });

  it('refuses an unauthenticated upload', async () => {
    const { projectId } = await withProject();
    const response = await api.post(`/api/projects/${projectId}/assets`, {
      body: multipart(png(4, 4)),
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('listing and deleting', () => {
  it('lists the assets of a project, newest first', async () => {
    const { actor, projectId } = await withProject();
    const first = (await upload(actor, projectId, multipart(png(1, 1)))).json<AssetSummary>();
    const second = (await upload(actor, projectId, multipart(png(2, 2)))).json<AssetSummary>();

    const listed = (await api.get(`/api/projects/${projectId}/assets`, { as: actor })).json<
      AssetSummary[]
    >();

    expect(listed.map((asset) => asset.id)).toEqual([second.id, first.id]);
  });

  it('deletes the row and the bytes', async () => {
    const { actor, projectId } = await withProject();
    const asset = (await upload(actor, projectId, multipart(png(3, 3)))).json<AssetSummary>();

    const response = await api.delete(`/api/projects/${projectId}/assets/${asset.id}`, {
      as: actor,
    });

    expect(response.statusCode).toBe(204);
    expect(await api.db.asset.count()).toBe(0);
    expect(storage.objects.size).toBe(0);
  });

  it('will not delete an asset belonging to another project', async () => {
    // The membership check is on the project in the URL, so an id from elsewhere has to be
    // refused by the service or one project's access would reach another's rows.
    const first = await withProject();
    const second = await withProject();
    const asset = (
      await upload(first.actor, first.projectId, multipart(png(5, 5)))
    ).json<AssetSummary>();

    const response = await api.delete(`/api/projects/${second.projectId}/assets/${asset.id}`, {
      as: second.actor,
    });

    expect(response.statusCode).toBe(404);
    expect(await api.db.asset.count()).toBe(1);
  });

  it('goes with the project when the project goes', async () => {
    // The cascade is the Prisma relation's, and it is what stops a deleted project leaving
    // rows behind. The objects are a separate question — see the note in PLAN.md.
    const { actor, projectId } = await withProject();
    await upload(actor, projectId, multipart(png(6, 6)));

    await api.delete(`/api/projects/${projectId}`, { as: actor });

    expect(await api.db.asset.count()).toBe(0);
  });
});
