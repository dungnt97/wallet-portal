// Routes index — registers all route plugins with their prefixes
import type { FastifyPluginAsync } from 'fastify';
import type { Config } from '../config/env.js';
import auditRoutes from './audit.routes.js';
import authRoutes from './auth.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import depositsRoutes from './deposits.routes.js';
import healthRoutes from './health.routes.js';
import internalRoutes from './internal.routes.js';
import multisigRoutes from './multisig.routes.js';
import staffRoutes from './staff.routes.js';
import sweepsRoutes from './sweeps.routes.js';
import usersRoutes from './users.routes.js';
import walletsRoutes from './wallets.routes.js';
import withdrawalsRoutes from './withdrawals.routes.js';

const routes: FastifyPluginAsync<{ cfg: Config }> = async (app, opts) => {
  // Public / liveness
  await app.register(healthRoutes);

  // Auth — Google Workspace OIDC + WebAuthn step-up (P06)
  await app.register(authRoutes, { cfg: opts.cfg });

  // Admin routes (session-protected via per-route preHandler)
  await app.register(dashboardRoutes);
  await app.register(depositsRoutes);
  await app.register(withdrawalsRoutes);
  await app.register(multisigRoutes);
  await app.register(sweepsRoutes, { sweepQueue: app.sweepQueue });
  await app.register(usersRoutes);
  await app.register(staffRoutes);
  await app.register(walletsRoutes);
  await app.register(auditRoutes);

  // Internal service-to-service routes (bearer token, D4) — paths include /internal prefix
  await app.register(internalRoutes, {
    bearerToken: opts.cfg.SVC_BEARER_TOKEN,
  });
};

export default routes;
