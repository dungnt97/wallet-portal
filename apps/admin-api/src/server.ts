// Server entry point — load config, build app, listen, graceful shutdown
// OTel MUST be imported first — instruments pg, ioredis, HTTP before any other require
import './telemetry/otel.js';
import 'dotenv/config';
import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';
import { initSentry } from './telemetry/sentry.js';

async function start(): Promise<void> {
  const cfg = loadConfig();
  initSentry();
  const app = await buildApp(cfg);

  try {
    await app.listen({ port: cfg.PORT, host: '0.0.0.0' });
    app.log.info(`Server listening on :${cfg.PORT}`);
  } catch (err) {
    app.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown — close HTTP server, Socket.io, DB pool, Redis
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutdown signal received — closing server');
    try {
      await app.close();
      app.log.info('Server closed gracefully');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void start();
