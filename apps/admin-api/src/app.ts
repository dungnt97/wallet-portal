// Fastify app factory — builds and configures the Fastify instance with all plugins
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Config } from './config/env.js';
import dbPlugin from './plugins/db.plugin.js';
import redisPlugin from './plugins/redis.plugin.js';
import queuePlugin from './plugins/queue.plugin.js';
import socketPlugin from './plugins/socket.plugin.js';
import swaggerPlugin from './plugins/swagger.plugin.js';
import telemetryPlugin from './plugins/telemetry.plugin.js';
import errorHandlerPlugin from './plugins/error-handler.plugin.js';
import routes from './routes/index.js';

export async function buildApp(cfg: Config) {
  const app = Fastify({
    logger: {
      level: cfg.LOG_LEVEL,
      ...(cfg.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }),
    },
    // Propagate x-request-id from incoming headers
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  // Zod type provider — validates requests + serializes responses via Zod schemas
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // OpenTelemetry stub (trace-id propagation only; real exporter in P10)
  await app.register(telemetryPlugin);

  // Security headers
  await app.register(helmet, {
    // Relax CSP for Swagger UI path
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
      },
    },
  });

  // CORS — allow configured UI origin only
  await app.register(cors, {
    origin: cfg.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Cookie + session
  await app.register(cookie);
  await app.register(session, {
    secret: cfg.SESSION_SECRET,
    cookieName: 'sessionId',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: cfg.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  });

  // Data layer
  await app.register(dbPlugin, { DATABASE_URL: cfg.DATABASE_URL });
  await app.register(redisPlugin, { REDIS_URL: cfg.REDIS_URL });
  await app.register(queuePlugin);

  // Socket.io gateway (namespace /stream — events wired in P09)
  await app.register(socketPlugin, { CORS_ORIGIN: cfg.CORS_ORIGIN });

  // OpenAPI spec + Swagger UI
  await app.register(swaggerPlugin);

  // Global error handler (must be registered before routes)
  await app.register(errorHandlerPlugin);

  // All routes — pass full cfg so auth routes can access OIDC + WebAuthn vars
  await app.register(routes, { cfg });

  return app;
}
