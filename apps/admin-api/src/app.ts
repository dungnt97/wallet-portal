import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import session from '@fastify/session';
import { trace } from '@opentelemetry/api';
// Fastify app factory — builds and configures the Fastify instance with all plugins
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Config } from './config/env.js';
import dbPlugin from './plugins/db.plugin.js';
import errorHandlerPlugin from './plugins/error-handler.plugin.js';
import queuePlugin from './plugins/queue.plugin.js';
import redisPlugin from './plugins/redis.plugin.js';
import socketPlugin from './plugins/socket.plugin.js';
import swaggerPlugin from './plugins/swagger.plugin.js';
import telemetryPlugin from './plugins/telemetry.plugin.js';
import routes from './routes/index.js';
import { resumeInFlightCeremonies } from './services/ceremony-resume.service.js';
import { startColdTimelockScheduler } from './services/cold-timelock-scheduler.js';
import {
  DIGEST_JOB_NAME,
  DIGEST_QUEUE,
  createEmailDigestWorker,
} from './workers/notif-email-digest.worker.js';
import { createEmailImmediateWorker } from './workers/notif-email-immediate.worker.js';
import { createSlackWorker } from './workers/notif-slack.worker.js';

export async function buildApp(cfg: Config) {
  const app = Fastify({
    logger: {
      level: cfg.LOG_LEVEL,
      // Inject OTel trace_id + span_id into every Pino log record
      formatters: {
        log(obj: Record<string, unknown>) {
          const span = trace.getActiveSpan();
          if (span) {
            const ctx = span.spanContext();
            return { ...obj, trace_id: ctx.traceId, span_id: ctx.spanId };
          }
          return obj;
        },
      },
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

  // Cold timelock scheduler — on-boot reconciliation + 5min periodic fallback (Slice 7)
  // Also probes for timelocks expiring within 10 minutes and notifies treasurers (Slice 5).
  // Must start after DB, queue plugins are registered. Cleanup registered as onClose hook.
  app.addHook('onReady', async () => {
    const stopScheduler = startColdTimelockScheduler(app.db, app.coldTimelockQueue, {
      io: app.io,
      emailQueue: app.emailQueue,
      slackQueue: app.slackQueue,
    });
    app.addHook('onClose', async () => stopScheduler());

    // Signer ceremony resume — re-enqueue orphaned in_progress ceremony jobs + alert on stale partials.
    // Safe: idempotent by BullMQ jobId; runs asynchronously so boot is not blocked.
    resumeInFlightCeremonies(
      app.db,
      app.ceremonyQueue,
      app.io,
      app.emailQueue,
      app.slackQueue
    ).catch((err: unknown) => app.log.error({ err }, 'Ceremony resume scan error'));

    // Build Redis connection opts from ioredis instance (BullMQ needs plain options)
    const redisOpts = {
      host: app.redis.options.host ?? 'localhost',
      port: app.redis.options.port ?? 6379,
      password: app.redis.options.password,
    };

    const smtpCfg = {
      host: cfg.SMTP_HOST,
      port: cfg.SMTP_PORT,
      user: cfg.SMTP_USER,
      pass: cfg.SMTP_PASS,
      from: cfg.SMTP_FROM,
    };

    // Email immediate worker (concurrency 5, processes notif_email_immediate queue)
    const emailImmediateWorker = createEmailImmediateWorker(app.db, smtpCfg, redisOpts);
    app.addHook('onClose', async () => emailImmediateWorker.close());

    // Email digest worker (concurrency 1, processes notif_email_digest queue hourly)
    const emailDigestWorker = createEmailDigestWorker(app.db, smtpCfg, redisOpts);
    app.addHook('onClose', async () => emailDigestWorker.close());

    // Register the repeatable hourly cron job (idempotent — BullMQ deduplicates by jobId)
    // Queue: notif_email_digest, cron: every hour at :00
    const { Queue } = await import('bullmq');
    const digestQueue = new Queue(DIGEST_QUEUE, { connection: redisOpts });
    await digestQueue.add(
      DIGEST_JOB_NAME,
      {},
      {
        jobId: 'digest-hourly-cron',
        repeat: { pattern: '0 * * * *' },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      }
    );
    await digestQueue.close();

    // Slack worker (concurrency 5, processes notif_slack queue for critical events)
    const slackWorker = createSlackWorker(cfg.SLACK_WEBHOOK_URL, redisOpts);
    app.addHook('onClose', async () => slackWorker.close());

    app.log.info('Notification workers started (email-immediate, email-digest, slack)');
  });

  return app;
}
