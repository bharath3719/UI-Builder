import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  CreateApiEndpointRequest,
  CreateApiIntegrationRequest,
  Id,
  REQUIRES,
  TestApiEndpointRequest,
  UpdateApiEndpointRequest,
  UpdateApiIntegrationRequest,
  type ApiEndpointSummary,
  type ApiIntegrationSecret,
  type ApiIntegrationSummary,
  type TestApiEndpointResponse,
} from '@ui-builder/schema';
import { requireWorkspaceAccess } from '../../lib/access.js';
import { parseBody, parseParams } from '../../lib/validate.js';
import { getCurrentUser } from '../../plugins/auth.js';
import * as integrations from './service.js';

const WorkspaceParams = z.object({ workspaceId: Id });
const IntegrationParams = z.object({ workspaceId: Id, integrationId: Id });
const EndpointParams = z.object({ workspaceId: Id, integrationId: Id, endpointId: Id });

/**
 * Integrations hang off a workspace, so these are registered under the workspace prefix.
 *
 * Kept in their own module rather than added to `workspaces/routes.ts` because they carry
 * their own service, their own outbound-request machinery and their own credential
 * handling — three things the workspace module has no business growing.
 */
const integrationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/:workspaceId/integrations', async (request, reply) => {
    const { workspaceId } = parseParams(WorkspaceParams, request);
    const access = await requireWorkspaceAccess(
      app.db,
      getCurrentUser(request).id,
      workspaceId,
      REQUIRES.integrationRead,
    );

    const body: ApiIntegrationSummary[] = await integrations.listIntegrations(app.db, access);

    return reply.send(body);
  });

  app.post('/:workspaceId/integrations', async (request, reply) => {
    const { workspaceId } = parseParams(WorkspaceParams, request);
    const input = parseBody(CreateApiIntegrationRequest, request);
    const access = await requireWorkspaceAccess(
      app.db,
      getCurrentUser(request).id,
      workspaceId,
      REQUIRES.integrationWrite,
    );

    const body: ApiIntegrationSummary = await integrations.createIntegration(app.db, access, input);

    return reply.status(201).send(body);
  });

  app.get('/:workspaceId/integrations/:integrationId', async (request, reply) => {
    const { workspaceId, integrationId } = parseParams(IntegrationParams, request);
    const access = await requireWorkspaceAccess(
      app.db,
      getCurrentUser(request).id,
      workspaceId,
      REQUIRES.integrationRead,
    );

    const body: ApiIntegrationSummary = await integrations.getIntegration(
      app.db,
      access,
      integrationId,
    );

    return reply.send(body);
  });

  app.patch('/:workspaceId/integrations/:integrationId', async (request, reply) => {
    const { workspaceId, integrationId } = parseParams(IntegrationParams, request);
    const input = parseBody(UpdateApiIntegrationRequest, request);
    const access = await requireWorkspaceAccess(
      app.db,
      getCurrentUser(request).id,
      workspaceId,
      REQUIRES.integrationWrite,
    );

    const body: ApiIntegrationSummary = await integrations.updateIntegration(
      app.db,
      access,
      integrationId,
      input,
    );

    return reply.send(body);
  });

  app.delete('/:workspaceId/integrations/:integrationId', async (request, reply) => {
    const { workspaceId, integrationId } = parseParams(IntegrationParams, request);
    const access = await requireWorkspaceAccess(
      app.db,
      getCurrentUser(request).id,
      workspaceId,
      REQUIRES.integrationWrite,
    );

    await integrations.deleteIntegration(app.db, access, integrationId);

    return reply.status(204).send();
  });

  /**
   * The credential, on its own route and behind its own role.
   *
   * Separate from the integration it belongs to so that listing connections — which every
   * member does, constantly — never puts a token on the wire. The studio asks for one only
   * when a query is about to run.
   */
  app.get('/:workspaceId/integrations/:integrationId/secret', async (request, reply) => {
    const { workspaceId, integrationId } = parseParams(IntegrationParams, request);
    const access = await requireWorkspaceAccess(
      app.db,
      getCurrentUser(request).id,
      workspaceId,
      REQUIRES.integrationSecretRead,
    );

    const body: ApiIntegrationSecret = await integrations.readIntegrationSecret(
      app.db,
      access,
      integrationId,
    );

    // A credential must not sit in a shared cache, and a 200 with no cache directive is
    // fair game for one.
    return reply.header('Cache-Control', 'no-store').send(body);
  });

  app.post('/:workspaceId/integrations/:integrationId/endpoints', async (request, reply) => {
    const { workspaceId, integrationId } = parseParams(IntegrationParams, request);
    const input = parseBody(CreateApiEndpointRequest, request);
    const access = await requireWorkspaceAccess(
      app.db,
      getCurrentUser(request).id,
      workspaceId,
      REQUIRES.integrationWrite,
    );

    const body: ApiEndpointSummary = await integrations.createEndpoint(
      app.db,
      access,
      integrationId,
      input,
    );

    return reply.status(201).send(body);
  });

  app.patch(
    '/:workspaceId/integrations/:integrationId/endpoints/:endpointId',
    async (request, reply) => {
      const { workspaceId, integrationId, endpointId } = parseParams(EndpointParams, request);
      const input = parseBody(UpdateApiEndpointRequest, request);
      const access = await requireWorkspaceAccess(
        app.db,
        getCurrentUser(request).id,
        workspaceId,
        REQUIRES.integrationWrite,
      );

      const body: ApiEndpointSummary = await integrations.updateEndpoint(
        app.db,
        access,
        integrationId,
        endpointId,
        input,
      );

      return reply.send(body);
    },
  );

  app.delete(
    '/:workspaceId/integrations/:integrationId/endpoints/:endpointId',
    async (request, reply) => {
      const { workspaceId, integrationId, endpointId } = parseParams(EndpointParams, request);
      const access = await requireWorkspaceAccess(
        app.db,
        getCurrentUser(request).id,
        workspaceId,
        REQUIRES.integrationWrite,
      );

      await integrations.deleteEndpoint(app.db, access, integrationId, endpointId);

      return reply.status(204).send();
    },
  );

  /**
   * Runs the endpoint from the server and keeps the response as its sample.
   *
   * A POST because it is not idempotent in either direction: it calls someone else's API,
   * which may be a `POST /orders`, and it writes `sampleResponse` on the way back.
   *
   * Guarded at write level rather than read: this makes a real outbound request with the
   * workspace's real credential, which is not something a viewer should be able to trigger.
   */
  app.post(
    '/:workspaceId/integrations/:integrationId/endpoints/:endpointId/test',
    async (request, reply) => {
      const { workspaceId, integrationId, endpointId } = parseParams(EndpointParams, request);
      const input = parseBody(TestApiEndpointRequest, request);
      const access = await requireWorkspaceAccess(
        app.db,
        getCurrentUser(request).id,
        workspaceId,
        REQUIRES.integrationWrite,
      );

      const body: TestApiEndpointResponse = await integrations.testEndpoint(
        app.db,
        access,
        integrationId,
        endpointId,
        input,
      );

      return reply.send(body);
    },
  );
};

export default integrationRoutes;
