// Swagger/OpenAPI plugin — serves OpenAPI 3.1 spec at /openapi.json + UI at /docs
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

const swaggerPlugin: FastifyPluginAsync = async (app) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Wallet Portal Admin API',
        description: 'Custodial treasury admin API — route stubs (P04); business logic in P09.',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          cookieAuth: { type: 'apiKey', in: 'cookie', name: 'sessionId' },
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { deepLinking: false },
  });

  // Expose spec at /openapi.json (canonical URL used by UI codegen in P05)
  app.get('/openapi.json', { schema: { hide: true } }, async (_req, reply) => {
    return reply.send(app.swagger());
  });
};

export default fp(swaggerPlugin, { name: 'swagger' });
